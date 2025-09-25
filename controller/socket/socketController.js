'use strict';

const { Server } = require('socket.io');
const cookie = require('cookie');
const jwt = require('jsonwebtoken');
const { Types } = require('mongoose');

const Conversation = require('../../model/conversationModel');
const Message = require('../../model/messageModel');
const { resolveChatActor } = require('../../utils/chatActor');
const { copyObject, deleteFile } = require('../../utils/wasabi');

const ACCESS_COOKIE_NAME = process.env.ACCESS_COOKIE_NAME || 'accessToken';
const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET;

const log = (...args) =>
  process.env.NODE_ENV !== 'production' && console.log('[socket]', ...args);

const ackOk = (ack, payload = {}) =>
  typeof ack === 'function' && ack({ ok: true, ...payload });
const ackErr = (ack, e, code = 'ERROR') =>
  typeof ack === 'function' &&
  ack({ ok: false, code, error: e?.message || String(e) });

const mapMessage = (m) => ({
  id: String(m._id),
  conversationId: String(m.conversation),
  sender: String(m.sender),
  type: m.type,
  text: m.text,
  attachments: m.attachments || [],
  clientId: m.clientId || null,
  createdAt: m.createdAt,
  editedAt: m.editedAt || null,
  deletedAt: m.deletedAt || null
});

const isValidId = (v) => Types.ObjectId.isValid(String(v));

/** COOKIE ONLY */
function getTokenFromHandshake(handshake) {
  const raw = handshake.headers?.cookie || '';
  const cookies = cookie.parse(raw || '');
  const token = cookies[ACCESS_COOKIE_NAME];
  if (!token) throw new Error('UNAUTHORIZED');
  return token;
}
function getUserFromHandshake(handshake) {
  const token = getTokenFromHandshake(handshake);
  const payload = jwt.verify(token, ACCESS_TOKEN_SECRET);
  const id = payload.sub || payload.id || payload.userId;
  const role = payload.role;
  const name = payload.name || null;
  if (!id || !role) throw new Error('UNAUTHORIZED');
  return { id, role, name };
}

async function onConnection(nsp, socket) {
  try {
    const user = getUserFromHandshake(socket.handshake);
    socket.req = { user };

    const actor = await resolveChatActor(socket.req);
    socket.actor = actor;

    // presence online
    nsp.emit('user:online', {
      userId: String(actor.userId),
      name: actor.name,
      role: actor.role
    });

    log('connected:', String(actor.userId), actor.role);

    // join all conversations
    const convs = await Conversation.find({ 'members.user': actor.userId })
      .select('_id')
      .lean();
    convs.forEach((c) => socket.join(String(c._id)));

    // role rooms
    const roleLower = String(actor.role || '').toLowerCase();
    if (roleLower === 'karyawan') socket.join('role:employee');
    if (roleLower === 'admin') socket.join('role:admin');

    /* ================== EVENTS ================== */

    // kirim pesan
    socket.on('chat:send', async (payload, ack) => {
      try {
        const {
          conversationId,
          text = '',
          attachments = [],
          clientId = null,
          type = 'text'
        } = payload || {};

        if (!conversationId || !isValidId(conversationId)) {
          throw new Error('conversationId tidak valid');
        }

        const conv = await Conversation.findOne({
          _id: conversationId,
          'members.user': actor.userId
        });
        if (!conv)
          throw new Error('Percakapan tidak ditemukan / bukan anggota');

        // idempotent by clientId
        if (clientId) {
          const dup = await Message.findOne({
            conversation: conv._id,
            clientId
          }).lean();
          if (dup) {
            const dto = mapMessage(dup);
            nsp.to(String(conversationId)).emit('chat:new', dto);
            return ackOk(ack, { message: dto });
          }
        }

        // sanitize attachments
        const cleaned = (attachments || [])
          .map((a) => ({
            key: a?.key,
            contentType: a?.contentType,
            size: a?.size,
            uploadedAt: a?.uploadedAt ? new Date(a.uploadedAt) : new Date()
          }))
          .filter((x) => x.key && x.contentType && typeof x.size === 'number');

        if (!String(text || '').trim() && cleaned.length === 0) {
          throw new Error('Pesan kosong');
        }

        // PROMOTION RULE
        const promoted = [];
        for (const a of cleaned) {
          const isCustomerConv = conv.type === 'customer';

          if (isCustomerConv) {
            if (a.key.startsWith('customer/')) {
              promoted.push(a);
            } else {
              const dest = a.key.startsWith('tmp/')
                ? a.key
                    .replace(/^tmp\/customer\//, 'customer/')
                    .replace(/^tmp\//, 'customer/')
                : a.key.replace(/^chat\//, 'customer/');
              await copyObject(a.key, dest, a.contentType);
              await deleteFile(a.key);
              promoted.push({ ...a, key: dest });
            }
          } else {
            if (a.key.startsWith('tmp/')) {
              const dest = a.key
                .replace(/^tmp\/customer\//, 'chat/')
                .replace(/^tmp\//, 'chat/');
              await copyObject(a.key, dest, a.contentType);
              await deleteFile(a.key);
              promoted.push({ ...a, key: dest });
            } else {
              promoted.push(a);
            }
          }
        }

        const msg = await Message.create({
          conversation: conv._id,
          sender: actor.userId,
          type,
          text,
          attachments: promoted,
          clientId
        });

        conv.lastMessage = msg._id;
        conv.lastMessageAt = msg.createdAt;
        await conv.save();

        const dto = mapMessage(msg);

        // broadcast ke seluruh anggota room
        nsp.to(String(conversationId)).emit('chat:new', dto);

        // ack langsung jadi delivered (✓✓ abu-abu)
        ackOk(ack, { message: dto });

        // broadcast delivered ke semua anggota
        nsp.to(String(conversationId)).emit('chat:delivered', {
          conversationId: String(conversationId),
          messageIds: [String(msg._id)],
          at: new Date()
        });
      } catch (e) {
        ackErr(ack, e);
      }
    });

    // delivered event manual dari FE
    socket.on('chat:delivered', async ({ conversationId, messageIds }) => {
      try {
        if (!conversationId || !isValidId(conversationId)) return;
        if (!Array.isArray(messageIds) || !messageIds.length) return;

        const exists = await Conversation.exists({
          _id: conversationId,
          'members.user': actor.userId
        });
        if (!exists) return;

        const at = new Date();

        nsp.to(String(conversationId)).emit('chat:delivered', {
          conversationId,
          userId: String(actor.userId),
          messageIds: messageIds.map(String),
          at
        });
      } catch (e) {
        log('chat:delivered error', e.message);
      }
    });

    // typing indikator
    socket.on('chat:typing', ({ conversationId, isTyping }) => {
      if (!conversationId || !isValidId(conversationId)) return;
      socket.to(String(conversationId)).emit('chat:typing', {
        conversationId,
        userId: String(actor.userId),
        name: actor.name,
        isTyping: !!isTyping
      });
    });

    // read receipt
    socket.on('chat:read', async ({ conversationId }) => {
      try {
        if (!conversationId || !isValidId(conversationId)) return;

        const exists = await Conversation.exists({
          _id: conversationId,
          'members.user': actor.userId
        });
        if (!exists) return;

        const at = new Date();

        await Conversation.updateOne(
          { _id: conversationId, 'members.user': actor.userId },
          { $set: { 'members.$.lastReadAt': at } }
        );

        nsp.to(String(conversationId)).emit('chat:read', {
          conversationId,
          userId: String(actor.userId),
          at
        });
      } catch (_) {}
    });

    // hapus pesan
    socket.on('chat:delete', async ({ messageId }, ack) => {
      try {
        if (!messageId || !isValidId(messageId)) {
          throw new Error('messageId tidak valid');
        }

        const msg = await Message.findById(messageId);
        if (!msg) throw new Error('Pesan tidak ditemukan');

        const conv = await Conversation.findById(msg.conversation);
        if (!conv) throw new Error('Percakapan tidak ditemukan');

        const isMember = conv.members.some(
          (m) => String(m.user) === String(actor.userId)
        );
        if (!isMember) throw new Error('Bukan anggota percakapan');

        const me = conv.members.find(
          (m) => String(m.user) === String(actor.userId)
        );
        const canManage =
          (me && ['owner', 'admin'].includes(me.role)) ||
          String(actor.role || '').toLowerCase() === 'admin';
        const isSender = String(msg.sender) === String(actor.userId);
        if (!isSender && !canManage)
          throw new Error('Tidak punya izin menghapus');

        const files = Array.isArray(msg.attachments) ? msg.attachments : [];
        if (files.length) {
          await Promise.allSettled(files.map((f) => deleteFile(f.key)));
        }

        msg.deletedAt = new Date();
        msg.text = '';
        msg.attachments = [];
        await msg.save();

        nsp.to(String(conv._id)).emit('chat:deleted', {
          conversationId: String(conv._id),
          messageId: String(msg._id),
          by: String(actor.userId),
          at: msg.deletedAt
        });

        ackOk(ack, { messageId: String(msg._id) });
      } catch (e) {
        ackErr(ack, e);
      }
    });

    // join room baru
    socket.on('conv:join', async ({ conversationId }, ack) => {
      try {
        if (!conversationId || !isValidId(conversationId)) {
          throw new Error('conversationId tidak valid');
        }
        const ok = await Conversation.exists({
          _id: conversationId,
          'members.user': actor.userId
        });
        if (!ok) throw new Error('Bukan anggota percakapan tersebut');
        socket.join(String(conversationId));
        ackOk(ack, { joined: String(conversationId) });
      } catch (e) {
        ackErr(ack, e);
      }
    });

    socket.on('conv:leave', ({ conversationId }) => {
      if (!conversationId || !isValidId(conversationId)) return;
      socket.leave(String(conversationId));
    });

    socket.on('disconnect', () => {
      nsp.emit('user:offline', { userId: String(actor.userId) });
      log('disconnected:', String(actor.userId));
    });
  } catch (e) {
    try {
      socket.emit('error', { error: 'UNAUTHORIZED' });
    } catch {}
    socket.disconnect(true);
  }
}

module.exports = function socketController(server) {
  const io = new Server(server, {
    cors: {
      origin: [
        process.env.FRONTEND_URL || 'https://soilab-app.vercel.app',
        'http://localhost:5173'
      ],
      credentials: true
    }
  });

  global.io = io;

  const nsp = io.of('/chat');

  nsp.use((socket, next) => {
    try {
      getUserFromHandshake(socket.handshake);
      return next();
    } catch {
      return next(new Error('UNAUTHORIZED'));
    }
  });

  nsp.on('connection', (socket) => onConnection(nsp, socket));
  return io;
};
