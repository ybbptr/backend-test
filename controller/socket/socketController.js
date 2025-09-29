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

/* ================== AUTH HELPERS ================== */
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

/* ================== PRESENCE ================== */
function getPresenceStore(nsp) {
  if (!nsp._presence) nsp._presence = new Map();
  return nsp._presence;
}
function markOnline(nsp, userId, socketId) {
  const presence = getPresenceStore(nsp);
  const set = presence.get(userId) || new Set();
  const first = set.size === 0;
  set.add(socketId);
  presence.set(userId, set);
  return { first };
}
function markOffline(nsp, userId, socketId) {
  const presence = getPresenceStore(nsp);
  const set = presence.get(userId);
  if (!set) return { last: true };
  set.delete(socketId);
  if (set.size === 0) {
    presence.delete(userId);
    return { last: true };
  }
  return { last: false };
}
function presenceSnapshot(nsp) {
  return Array.from(getPresenceStore(nsp).keys());
}

/* ================== ATTACHMENT PROMOTION ================== */
async function promoteAttachments(convType, attachments = []) {
  const cleaned = (attachments || [])
    .map((a) => ({
      key: a?.key,
      contentType: a?.contentType,
      size: a?.size,
      uploadedAt: a?.uploadedAt ? new Date(a.uploadedAt) : new Date()
    }))
    .filter((x) => x.key && x.contentType && typeof x.size === 'number');

  if (cleaned.length === 0) return [];

  const promoted = [];
  for (const a of cleaned) {
    const isCustomerConv = convType === 'customer';
    if (isCustomerConv) {
      const dest = a.key.startsWith('tmp/')
        ? a.key
            .replace(/^tmp\/customer\//, 'customer/')
            .replace(/^tmp\//, 'customer/')
        : a.key.replace(/^chat\//, 'customer/');
      if (dest !== a.key) {
        await copyObject(a.key, dest, a.contentType);
        await deleteFile(a.key);
      }
      promoted.push({ ...a, key: dest });
    } else {
      const dest = a.key.startsWith('tmp/')
        ? a.key.replace(/^tmp\/customer\//, 'chat/').replace(/^tmp\//, 'chat/')
        : a.key;
      if (dest !== a.key) {
        await copyObject(a.key, dest, a.contentType);
        await deleteFile(a.key);
      }
      promoted.push({ ...a, key: dest });
    }
  }
  return promoted;
}

/* ================== JOIN ROOMS ================== */
async function joinUserRooms(socket, actor) {
  const convs = await Conversation.find({ 'members.user': actor.userId })
    .select('_id')
    .lean();
  convs.forEach((c) => socket.join(String(c._id)));

  const roleLower = String(actor.role || '').toLowerCase();
  if (roleLower === 'karyawan') socket.join('role:employee');
  if (roleLower === 'admin') socket.join('role:admin');
}

/* ================== CONNECTION HANDLER ================== */
async function onConnection(nsp, socket) {
  try {
    const user = getUserFromHandshake(socket.handshake);
    socket.req = { user };

    const actor = await resolveChatActor(socket.req);
    socket.actor = actor;

    const uid = String(actor.userId);
    const name = actor.name || user.name || 'User';
    const role = actor.role;

    // Presence
    const { first } = markOnline(nsp, uid, socket.id);
    socket.emit('presence:init', {
      me: { userId: uid, name, role },
      online: presenceSnapshot(nsp)
    });
    if (first) {
      socket.broadcast.emit('user:online', { userId: uid, name, role });
    }

    log('connected:', uid, role);

    await joinUserRooms(socket, actor);

    /* =============== EVENTS =============== */

    socket.on('presence:list', (ack) => {
      ackOk(ack, { online: presenceSnapshot(nsp) });
    });

    // Kirim pesan
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

        // Idempotent by clientId
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

        if (
          !String(text || '').trim() &&
          (!attachments || !attachments.length)
        ) {
          throw new Error('Pesan kosong');
        }

        const promoted = await promoteAttachments(conv.type, attachments);

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

        nsp.to(String(conversationId)).emit('chat:new', dto);
        ackOk(ack, { message: dto });

        nsp.to(String(conversationId)).emit('chat:delivered', {
          conversationId: String(conversationId),
          messageIds: [String(msg._id)],
          at: new Date()
        });
      } catch (e) {
        ackErr(ack, e);
      }
    });

    // Delivered manual dari FE
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

    // Typing indikator
    socket.on('chat:typing', ({ conversationId, isTyping }) => {
      if (!conversationId || !isValidId(conversationId)) return;
      socket.to(String(conversationId)).emit('chat:typing', {
        conversationId,
        userId: String(actor.userId),
        name: actor.name,
        isTyping: !!isTyping
      });
    });

    // Read receipt
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

    // Delete message
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
      const { last } = markOffline(nsp, uid, socket.id);
      if (last) {
        socket.broadcast.emit('user:offline', { userId: uid });
      }
      log('disconnected:', uid);
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
