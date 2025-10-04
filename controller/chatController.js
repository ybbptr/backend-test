'use strict';

/* ========= IMPORTS ========= */
const mongoose = require('mongoose');
const asyncHandler = require('express-async-handler');
const { deleteFile } = require('../utils/wasabi'); // <— sesuai permintaan
const throwError = require('../utils/throwError');
const { resolveChatActor } = require('../utils/chatActor');

const Conversation = require('../model/conversationModel');
const Message = require('../model/messageModel');
const Employee = require('../model/employeeModel');
const User = require('../model/userModel');

/* ========= HELPERS ========= */
const asId = (x) => new mongoose.Types.ObjectId(String(x));
const isValidId = (v) => mongoose.Types.ObjectId.isValid(String(v));

const makeCursor = (date, id) =>
  Buffer.from(`${date.toISOString()}|${id}`).toString('base64');
const readCursor = (cur) => {
  try {
    const [iso, id] = Buffer.from(cur, 'base64').toString('utf8').split('|');
    return { date: new Date(iso), id };
  } catch {
    return null;
  }
};

function guessConvTitle(conv, myUserId) {
  const t = conv?.title?.trim();
  if (t) return t;
  if (conv?.type === 'direct') {
    const other = (conv?.members || [])
      .map((m) => m.user)
      .find((u) => String(u?._id || u) !== String(myUserId));
    return other?.name || 'Tanpa Nama';
  }
  return 'Tanpa Nama';
}

function makeSnippet(text = '', q = '') {
  if (!text) return '';
  const idx = text.toLowerCase().indexOf(String(q).toLowerCase());
  if (idx < 0) return text.slice(0, 120);
  const start = Math.max(0, idx - 20);
  const end = Math.min(text.length, idx + q.length + 80);
  return (
    (start > 0 ? '…' : '') +
    text.slice(start, end) +
    (end < text.length ? '…' : '')
  );
}

function escapeRegex(s = '') {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const getUid = (u) => String((u && (u._id || u.id || u)) || '');
async function buildEmpNameMapFromUsers(users = []) {
  const ids = new Set();
  for (const u of users) {
    if (!u) continue;
    const role = String(u.role || '').toLowerCase();
    if (role === 'karyawan') ids.add(getUid(u));
  }
  if (!ids.size) return new Map();
  const emps = await Employee.find({ user: { $in: Array.from(ids) } })
    .select('user name')
    .lean();
  return new Map(emps.map((e) => [String(e.user), e.name]));
}

function pickDisplayNameWithEmp(userDoc, empMap = new Map()) {
  if (!userDoc) return 'Tanpa Nama';
  const uid = String(userDoc._id || userDoc.id || userDoc) || '';
  const role = String(userDoc.role || '').toLowerCase();

  if (role === 'karyawan') {
    return empMap.get(uid) || userDoc.name || userDoc.email || 'Tanpa Nama';
  }
  if (role === 'bot') {
    return userDoc.name || 'Soilab Bot';
  }
  return userDoc.name || userDoc.email || 'Tanpa Nama';
}

async function buildConvViewForViewer(convDoc, viewerUserId) {
  await convDoc.populate({ path: 'members.user', select: 'name email role' });

  const allUsers = (convDoc.members || []).map((m) => m.user).filter(Boolean);
  const empMap = await buildEmpNameMapFromUsers(allUsers);

  const decoratedMembers = (convDoc.members || []).map((m) => {
    const u = m.user;
    return {
      ...(typeof m.toObject === 'function' ? m.toObject() : m),
      user: u
        ? { _id: u._id, name: u.name, email: u.email, role: u.role }
        : null,
      displayName: u ? pickDisplayNameWithEmp(u, empMap) : 'Tanpa Nama'
    };
  });

  const me = decoratedMembers.find(
    (m) => String(m.user?._id || m.user) === String(viewerUserId)
  );
  const hideBefore = me?.deletedAt ? new Date(me.deletedAt) : new Date(0);

  let last = await Message.findOne({
    conversation: convDoc._id,
    createdAt: { $gt: hideBefore }
  })
    .sort({ createdAt: -1, _id: -1 })
    .select('_id text attachments sender createdAt type conversation')
    .populate({ path: 'sender', select: 'name email role' })
    .lean();

  if (last?.sender) {
    last.sender = {
      _id: String(last.sender._id),
      role: last.sender.role,
      name: pickDisplayNameWithEmp(last.sender, empMap),
      email: last.sender.email
    };
  }

  let displayTitle = convDoc.title?.trim() || null;
  if (convDoc.type !== 'group') {
    const other = decoratedMembers.find(
      (m) => String(m.user?._id || m.user) !== String(viewerUserId)
    );
    displayTitle = other?.displayName || displayTitle || 'Tanpa Nama';
  } else {
    displayTitle = displayTitle || 'Tanpa Nama';
  }

  const computedTitle =
    convDoc.type === 'group'
      ? convDoc.title?.trim() || 'Tanpa Nama'
      : displayTitle || 'Tanpa Nama';

  const idStr = String(convDoc._id);

  return {
    _id: idStr,
    id: idStr,
    type: convDoc.type,
    title: computedTitle,
    displayTitle,
    name: displayTitle,
    members: decoratedMembers.map((m) => ({
      user: m.user
        ? {
            _id: String(m.user._id),
            name: m.user.name,
            email: m.user.email,
            role: m.user.role
          }
        : null,
      role: m.role,
      lastReadAt: m.lastReadAt || null,
      pinned: !!m.pinned,
      deletedAt: m.deletedAt || null,
      displayName: m.displayName
    })),
    createdBy: String(convDoc.createdBy || ''),
    createdAt: convDoc.createdAt,
    updatedAt: convDoc.updatedAt,
    expireAt: convDoc.expireAt || null,
    pinnedMessages: convDoc.pinnedMessages || [],
    lastMessageAt: last?.createdAt || null,
    lastMessage: last
      ? {
          id: String(last._id),
          conversationId: idStr,
          sender: last.sender || null,
          type: last.type,
          text: last.text,
          attachments: last.attachments || [],
          createdAt: last.createdAt
        }
      : null
  };
}

async function emitConvNewForAllMembers(convDoc) {
  try {
    const nsp = global.io?.of('/chat');
    if (!nsp) return;

    for (const m of convDoc.members || []) {
      const viewerId = String(m.user);
      const view = await buildConvViewForViewer(convDoc, viewerId);
      nsp.to(viewerId).emit('conv:new', view);
    }
  } catch {}
}

/* ========= CONTROLLERS ========= */

const listConversations = asyncHandler(async (req, res) => {
  const actor = await resolveChatActor(req);
  const roleLower = String(req.user.role || '').toLowerCase();
  const { type, q, limit = 50, cursor } = req.query;
  const lim = Math.max(1, Math.min(Number(limit) || 30, 100));
  const userId = asId(actor.userId);

  const baseMatch = { 'members.user': userId };
  if (roleLower === 'user') baseMatch.type = 'customer';
  else if (type) baseMatch.type = type;
  if (q) baseMatch.title = { $regex: q, $options: 'i' };

  const pipeline = [
    { $match: baseMatch },

    // Ambil profil member "me" + cutoff
    {
      $addFields: {
        me: {
          $first: {
            $filter: {
              input: '$members',
              as: 'm',
              cond: { $eq: ['$$m.user', userId] }
            }
          }
        }
      }
    },
    { $addFields: { hideBefore: { $ifNull: ['$me.deletedAt', new Date(0)] } } },

    // Last message setelah cutoff -> lastVisible
    {
      $lookup: {
        from: 'messages',
        let: { convId: '$_id', hb: '$hideBefore' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$conversation', '$$convId'] },
                  { $gt: ['$createdAt', '$$hb'] }
                ]
              }
            }
          },
          { $sort: { createdAt: -1, _id: -1 } },
          { $limit: 1 },
          { $project: { createdAt: 1, text: 1, attachments: 1, sender: 1 } }
        ],
        as: 'lastVisible'
      }
    },
    { $set: { lastVisible: { $first: '$lastVisible' } } },
    { $set: { lastVisibleAt: '$lastVisible.createdAt' } },

    // Tampilkan hanya convo yang masih punya pesan setelah hideBefore
    { $match: { lastVisibleAt: { $ne: null } } }
  ];

  // Cursor berdasarkan lastVisibleAt
  if (cursor) {
    const c = readCursor(cursor);
    if (c?.date && c?.id) {
      pipeline.push({
        $match: {
          $or: [
            { lastVisibleAt: { $lt: c.date } },
            { lastVisibleAt: c.date, _id: { $lt: asId(c.id) } }
          ]
        }
      });
    }
  }

  pipeline.push(
    { $sort: { lastVisibleAt: -1, _id: -1 } },
    { $limit: lim + 1 },
    {
      $project: {
        type: 1,
        title: 1,
        members: 1,
        createdBy: 1,
        createdAt: 1,
        updatedAt: 1,
        expireAt: 1,
        pinnedMessages: 1,

        lastMessage: '$lastVisible',
        lastMessageAt: '$lastVisibleAt'
      }
    }
  );

  const rows = await Conversation.aggregate(pipeline);
  const hasMore = rows.length > lim;
  const items = hasMore ? rows.slice(0, lim) : rows;

  await Conversation.populate(items, {
    path: 'members.user',
    select: 'name email role',
    options: { retainNullValues: true }
  });

  const senderIds = items
    .map((c) => c.lastMessage?.sender)
    .filter(Boolean)
    .map((id) => asId(id));
  const senderDocs = senderIds.length
    ? await User.find({ _id: { $in: senderIds } })
        .select('_id name email role')
        .lean()
    : [];
  const senderMap = new Map(senderDocs.map((u) => [String(u._id), u]));

  const allUsers = [];
  for (const c of items) {
    for (const m of c.members || []) if (m.user) allUsers.push(m.user);
    const su = senderMap.get(String(c.lastMessage?.sender));
    if (su) allUsers.push(su);
  }
  const empMap = await buildEmpNameMapFromUsers(allUsers); // <-- BUAT DULU

  const myId = String(actor.userId);
  for (const c of items) {
    c.members = (c.members || []).map((m) => {
      const u = m.user;
      return { ...m, displayName: pickDisplayNameWithEmp(u, empMap) };
    });

    if (c.lastMessage?.sender) {
      const su = senderMap.get(String(c.lastMessage.sender));
      if (su) {
        c.lastMessage.sender = {
          _id: su._id,
          role: su.role,
          name: pickDisplayNameWithEmp(su, empMap),
          email: su.email
        };
      }
    }

    if (c.type !== 'group') {
      const other = (c.members || []).find(
        (m) => String(m.user?._id || m.user) !== myId
      );
      c.displayTitle =
        other?.displayName ||
        pickDisplayNameWithEmp(other?.user, empMap) ||
        'Tanpa Nama';

      c.title = c.displayTitle; // sinkron utk FE lama
    } else {
      c.title = c.title?.trim() || 'Tanpa Nama';
    }
  }

  await Promise.all(
    items.map(async (c) => {
      const me = (c.members || []).find(
        (m) => String(m.user?._id || m.user) === myId
      );
      const cutoff = new Date(
        Math.max(
          me?.lastReadAt ? new Date(me.lastReadAt).getTime() : 0,
          me?.deletedAt ? new Date(me.deletedAt).getTime() : 0
        )
      );
      const query = {
        conversation: c._id,
        sender: { $ne: asId(actor.userId) },
        createdAt: { $gt: cutoff }
      };
      c.unreadCount = await Message.countDocuments(query);
    })
  );

  const ref = items[items.length - 1];
  const nextCursor =
    hasMore && ref && ref.lastMessageAt
      ? makeCursor(ref.lastMessageAt, ref._id)
      : null;

  res.json({ items, nextCursor, hasMore });
});

const createConversation = asyncHandler(async (req, res) => {
  const actor = await resolveChatActor(req);
  const roleLower = String(req.user.role || '').toLowerCase();
  const { type, title, memberIds } = req.body || {};

  if (!type) throwError('type wajib diisi', 400);
  if (!Array.isArray(memberIds) || memberIds.length < 1) {
    throwError('memberIds wajib diisi', 400);
  }

  if (roleLower === 'user') {
    throwError(
      'Customer tidak bisa membuat percakapan langsung. Gunakan /chat/customer/open',
      403
    );
  }

  const uniqIds = [...new Set(memberIds.map(String))];
  if (!uniqIds.includes(String(actor.userId)))
    uniqIds.push(String(actor.userId));

  if (type === 'direct') {
    if (uniqIds.length !== 2) throwError('Direct harus tepat 2 anggota', 400);
    const [a, b] = uniqIds.sort();
    const existing = await Conversation.findOne({
      type: 'direct',
      memberKey: `${a}:${b}`
    });
    if (existing) {
      // Kirim realtime payload yang sudah dihias (viewer-specific) dan balas untuk pemanggil
      await emitConvNewForAllMembers(existing);
      const viewForCreator = await buildConvViewForViewer(
        existing,
        actor.userId
      );
      return res.status(200).json(viewForCreator);
    }
  }

  if (type === 'group') {
    if (roleLower !== 'admin')
      throwError('Hanya admin yang boleh membuat grup', 403);
    if (!title || !title.trim()) throwError('Group butuh title', 400);
    if (uniqIds.length < 3) throwError('Group minimal 3 anggota', 400);
  }

  if (type === 'announcement') {
    throwError('Fitur announcement sudah tidak tersedia', 400);
  }

  const members = uniqIds.map((uid) => ({
    user: asId(uid),
    role: String(uid) === String(actor.userId) ? 'owner' : 'member',
    lastReadAt: null,
    pinned: false
  }));

  let conv = await Conversation.create({
    type,
    title: type === 'group' ? title : undefined,
    createdBy: asId(actor.userId),
    members
  });

  // Emit ke semua anggota dengan payload yang sudah viewer-specific
  await conv.populate({ path: 'members.user', select: 'name email role' });
  await emitConvNewForAllMembers(conv);

  // Kembalikan payload yang sudah dihias untuk pembuat
  const viewForCreator = await buildConvViewForViewer(conv, actor.userId);
  res.status(201).json(viewForCreator);
});

const updateConversation = asyncHandler(async (req, res) => {
  const actor = await resolveChatActor(req);
  const { id } = req.params;
  const { title } = req.body || {};

  const conv = await Conversation.findById(id);
  if (!conv) throwError('Percakapan tidak ditemukan', 404);

  const me = conv.members.find((m) => String(m.user) === String(actor.userId));
  if (!me) throwError('Bukan anggota', 403);

  if (typeof title === 'string') {
    if (conv.type === 'customer') {
      throwError('Percakapan customer tidak memiliki judul untuk diubah', 400);
    }
    if (conv.type !== 'group') {
      throwError('Title hanya bisa diubah untuk grup', 400);
    }
    if (!['owner', 'admin'].includes(me.role)) {
      throwError('Hanya owner/admin grup yang bisa ganti nama', 403);
    }
    conv.title = title.trim() || conv.title;
  }

  await conv.save();
  res.json(conv);
});

const updateMembers = asyncHandler(async (req, res) => {
  const actor = await resolveChatActor(req);
  const { id } = req.params;
  const { add = [], remove = [], roles = [] } = req.body || {};

  const conv = await Conversation.findById(id);
  if (!conv) throwError('Percakapan tidak ditemukan', 404);

  const me = conv.members.find((m) => String(m.user) === String(actor.userId));
  if (!me) throwError('Bukan anggota', 403);
  if (!['owner', 'admin'].includes(me.role)) {
    throwError('Hanya owner/admin grup yang boleh kelola anggota', 403);
  }
  if (conv.type === 'direct') throwError('Direct tidak bisa ubah anggota', 400);
  if (conv.type === 'customer')
    throwError('Percakapan customer tidak bisa diubah anggotanya', 400);

  // Tambah
  for (const uid of new Set(add.map(String))) {
    if (!conv.members.some((m) => String(m.user) === uid)) {
      conv.members.push({
        user: asId(uid),
        role: 'member',
        lastReadAt: null
      });
    }
  }

  // Cegah hapus owner terakhir
  const removeSet = new Set(remove.map(String));
  const ownersBefore = conv.members
    .filter((m) => m.role === 'owner')
    .map((m) => String(m.user));
  const ownersToRemove = ownersBefore.filter((uid) => removeSet.has(uid));
  if (ownersToRemove.length >= ownersBefore.length && ownersBefore.length > 0) {
    throwError('Tidak boleh menghapus owner terakhir', 400);
  }
  conv.members = conv.members.filter((m) => !removeSet.has(String(m.user)));

  // Ubah role
  for (const r of roles) {
    const target = conv.members.find((m) => String(m.user) === String(r.user));
    if (target) {
      if (r.role === 'owner') {
        conv.members.forEach((m) => {
          if (String(m.user) !== String(target.user) && m.role === 'owner')
            m.role = 'admin';
        });
        target.role = 'owner';
      } else if (['admin', 'member'].includes(r.role)) {
        target.role = r.role;
      }
    }
  }

  await conv.save();
  res.json(conv);
});

const getMessages = asyncHandler(async (req, res) => {
  const actor = await resolveChatActor(req);
  const { id } = req.params;
  const { limit = 50, cursor, dir = 'back' } = req.query;
  const lim = Math.max(1, Math.min(Number(limit) || 50, 100));

  const conv = await Conversation.findOne({
    _id: id,
    'members.user': asId(actor.userId)
  })
    .select('_id members')
    .lean();
  if (!conv) throwError('Tidak boleh akses percakapan ini', 403);

  const me = (conv.members || []).find(
    (m) => String(m.user) === String(actor.userId)
  );
  const hideBefore = me?.deletedAt ? new Date(me.deletedAt) : new Date(0);

  const and = [{ conversation: asId(id) }, { createdAt: { $gt: hideBefore } }];

  if (cursor) {
    const c = readCursor(cursor);
    if (c?.date && c?.id) {
      if (dir === 'back') {
        and.push({
          $or: [
            { createdAt: { $lt: c.date } },
            { createdAt: c.date, _id: { $lt: asId(c.id) } }
          ]
        });
      } else {
        and.push({
          $or: [
            { createdAt: { $gt: c.date } },
            { createdAt: c.date, _id: { $gt: asId(c.id) } }
          ]
        });
      }
    }
  }

  const sort =
    dir === 'back' ? { createdAt: -1, _id: -1 } : { createdAt: 1, _id: 1 };

  const rows = await Message.find({ $and: and })
    .sort(sort)
    .limit(lim + 1)
    .select('text sender createdAt attachments deletedAt type')
    .populate({ path: 'sender', select: 'name email role' })
    .lean();

  const hasMore = rows.length > lim;
  const items = hasMore ? rows.slice(0, lim) : rows;
  const normalized = dir === 'back' ? items.reverse() : items;

  const senders = [];
  for (const m of normalized) if (m.sender) senders.push(m.sender);
  const empMap = await buildEmpNameMapFromUsers(senders);
  for (const m of normalized)
    if (m.sender) m.sender.name = pickDisplayNameWithEmp(m.sender, empMap);

  let anchor = null;
  if (hasMore && normalized.length) {
    anchor = dir === 'back' ? normalized[0] : normalized[normalized.length - 1];
  }
  const nextCursor = anchor ? makeCursor(anchor.createdAt, anchor._id) : null;

  res.json({ items: normalized, nextCursor, hasMore });
});

const openCustomerChat = asyncHandler(async (req, res) => {
  if (String(req.user.role || '').toLowerCase() !== 'user') {
    throwError('Hanya customer yang bisa membuka chat ini', 403);
  }

  const userId = asId(req.user.id);

  const adminUser = await User.findOne({
    role: 'admin',
    isCustomerInbox: true
  }).lean();
  if (!adminUser) throwError('Tidak ada admin inbox customer', 404);

  let conv = await Conversation.findOne({
    type: 'customer',
    'members.user': { $all: [userId, asId(adminUser._id)] }
  });

  if (!conv) {
    conv = await Conversation.create({
      type: 'customer',
      members: [
        { user: userId, role: 'member' },
        { user: asId(adminUser._id), role: 'admin' }
      ]
    });

    await conv.populate({ path: 'members.user', select: 'name email role' });
    await emitConvNewForAllMembers(conv);
  } else {
    await conv.populate({ path: 'members.user', select: 'name email role' });
    await emitConvNewForAllMembers(conv);
  }

  res.json({
    conversationId: String(conv._id),
    conversation: await buildConvViewForViewer(conv, userId)
  });
});

const getContacts = asyncHandler(async (req, res) => {
  const role = String(req.user.role || '').toLowerCase();
  const myUserId = req.user.id;

  if (role === 'user') {
    return res.json({ contacts: [] });
  }

  const employees = await Employee.find({ user: { $ne: myUserId } })
    .select('_id name user')
    .populate('user', 'role email')
    .lean();

  const admins = await User.find({ role: 'admin', _id: { $ne: myUserId } })
    .select('_id role email name')
    .lean();

  const bots = await User.find({ role: 'bot' })
    .select('_id role email name')
    .lean();

  const empContacts = employees.map((e) => ({
    userId: e.user?._id,
    id: String(e._id),
    name: e.name,
    role: e.user?.role || 'karyawan',
    email: e.user?.email || null
  }));

  const adminContacts = admins.map((a) => ({
    userId: a._id,
    id: String(a._id),
    name: a.name || 'Admin',
    role: a.role,
    email: a.email
  }));

  const botContacts = bots.map((b) => ({
    userId: b._id,
    id: String(b._id),
    name: b.name || 'Soilab Bot',
    role: b.role,
    email: b.email || null
  }));

  const contacts = [...empContacts, ...adminContacts, ...botContacts];

  res.json({ contacts });
});

function canManagePin(conv, reqRole, userId) {
  const roleLower = String(reqRole || '').toLowerCase();
  if (conv.type === 'group') {
    const me = conv.members.find((m) => String(m.user) === String(userId));
    return (
      (me && ['owner', 'admin'].includes(me.role)) || roleLower === 'admin'
    );
  }
  if (conv.type === 'direct') {
    return conv.members.some((m) => String(m.user) === String(userId));
  }
  if (conv.type === 'customer') {
    return roleLower === 'admin';
  }
  return false;
}

const pinMessage = asyncHandler(async (req, res) => {
  const actor = await resolveChatActor(req);
  const { id } = req.params;
  const { messageId, clientId } = req.body || {};

  if (!isValidId(id)) throwError('conversationId tidak valid', 400);
  if (!messageId && !clientId) {
    throwError('Harus kirim messageId atau clientId', 400);
  }

  const conv = await Conversation.findOne({
    _id: id,
    'members.user': asId(actor.userId)
  }).select('type members pinnedMessages');
  if (!conv) throwError('Percakapan tidak ditemukan / bukan anggota', 403);

  if (!canManagePin(conv, req.user.role, actor.userId)) {
    throwError('Tidak punya izin untuk pin pesan', 403);
  }

  // cutoff untuk pin visibility (biar konsisten)
  const me = conv.members.find((m) => String(m.user) === String(actor.userId));
  const hideBefore = me?.deletedAt ? new Date(me.deletedAt) : new Date(0);

  let msg = null;
  const baseMsgFind = {
    conversation: id,
    createdAt: { $gt: hideBefore }
  };

  if (messageId) {
    msg = await Message.findOne({
      _id: messageId,
      ...baseMsgFind
    })
      .select('_id sender type text attachments createdAt clientId')
      .populate({ path: 'sender', select: 'name email role' })
      .lean();
  } else if (clientId) {
    msg = await Message.findOne({
      clientId,
      ...baseMsgFind
    })
      .select('_id sender type text attachments createdAt clientId')
      .populate({ path: 'sender', select: 'name email role' })
      .lean();
  }

  if (!msg) throwError('Pesan tidak ditemukan / di luar jangkauan', 404);

  const already = (conv.pinnedMessages || []).some(
    (p) => String(p.message) === String(msg._id)
  );
  if (!already) {
    conv.pinnedMessages.push({
      message: asId(msg._id),
      pinnedBy: asId(actor.userId),
      pinnedAt: new Date()
    });
    await conv.save();
  }

  const pinnedByUserLike = {
    _id: actor.userId,
    role: req.user.role,
    name: req.user.name || null
  };
  const empMap = await buildEmpNameMapFromUsers([msg.sender, pinnedByUserLike]);

  const dtoMsg = {
    id: String(msg._id),
    type: msg.type,
    text: msg.text,
    attachments: msg.attachments || [],
    sender: {
      id: String(msg.sender?._id || msg.sender),
      name: pickDisplayNameWithEmp(msg.sender, empMap),
      role: msg.sender?.role || null
    },
    createdAt: msg.createdAt
  };

  try {
    const nsp = global.io?.of('/chat');
    nsp?.to(String(id)).emit('chat:pin', {
      conversationId: String(id),
      message: dtoMsg,
      pinnedBy: String(actor.userId),
      pinnedAt: new Date()
    });
  } catch {}

  return res
    .status(200)
    .json({ ok: true, pinned: { messageId: String(msg._id) } });
});

const unpinMessage = asyncHandler(async (req, res) => {
  const actor = await resolveChatActor(req);
  const { id, messageId } = req.params;

  if (!isValidId(id)) throwError('conversationId tidak valid', 400);
  if (!isValidId(messageId)) throwError('messageId tidak valid', 400);

  const conv = await Conversation.findOne({
    _id: id,
    'members.user': asId(actor.userId)
  }).select('type members pinnedMessages');
  if (!conv) throwError('Percakapan tidak ditemukan / bukan anggota', 403);

  if (!canManagePin(conv, req.user.role, actor.userId)) {
    throwError('Tidak punya izin untuk unpin pesan', 403);
  }

  const before = conv.pinnedMessages.length;
  conv.pinnedMessages = (conv.pinnedMessages || []).filter(
    (p) => String(p.message) !== String(messageId)
  );
  if (conv.pinnedMessages.length !== before) await conv.save();

  try {
    const nsp = global.io?.of('/chat');
    nsp?.to(String(id)).emit('chat:unpin', {
      conversationId: String(id),
      messageId: String(messageId)
    });
  } catch {}

  return res
    .status(200)
    .json({ ok: true, unpinned: { messageId: String(messageId) } });
});

const listPinnedMessages = asyncHandler(async (req, res) => {
  const actor = await resolveChatActor(req);
  const { id } = req.params;

  if (!isValidId(id)) throwError('conversationId tidak valid', 400);

  const conv = await Conversation.findOne({
    _id: id,
    'members.user': asId(actor.userId)
  })
    .select('members pinnedMessages')
    .populate({
      path: 'pinnedMessages.message',
      select: 'type text attachments sender createdAt deletedAt',
      populate: { path: 'sender', select: 'name email role' }
    })
    .populate({
      path: 'pinnedMessages.pinnedBy',
      select: 'name email role'
    })
    .lean();

  if (!conv) throwError('Percakapan tidak ditemukan / bukan anggota', 403);

  const me = (conv.members || []).find(
    (m) => String(m.user) === String(actor.userId)
  );
  const hideBefore = me?.deletedAt ? new Date(me.deletedAt) : new Date(0);

  const userLikes = [];
  for (const p of conv.pinnedMessages || []) {
    if (p.message?.sender) userLikes.push(p.message.sender);
    if (p.pinnedBy) userLikes.push(p.pinnedBy);
  }
  const empMap = await buildEmpNameMapFromUsers(userLikes);

  const items = (conv.pinnedMessages || [])
    .filter(
      (p) =>
        p.message &&
        !p.message.deletedAt &&
        new Date(p.message.createdAt) > hideBefore
    )
    .map((p) => ({
      messageId: String(p.message?._id),
      type: p.message?.type || 'text',
      text: p.message?.text || '',
      attachments: p.message?.attachments || [],
      sender: p.message?.sender
        ? {
            id: String(p.message.sender._id || p.message.sender),
            name: pickDisplayNameWithEmp(p.message.sender, empMap),
            role: p.message.sender.role || null
          }
        : null,
      createdAt: p.message?.createdAt || null,
      pinnedBy: p.pinnedBy
        ? {
            id: String(p.pinnedBy._id || p.pinnedBy),
            name: pickDisplayNameWithEmp(p.pinnedBy, empMap),
            role: p.pinnedBy.role || null
          }
        : null,
      pinnedAt: p.pinnedAt || null
    }));

  return res.status(200).json({ items });
});

const getConversationMedia = asyncHandler(async (req, res) => {
  const actor = await resolveChatActor(req);
  const { id } = req.params;
  const { type = 'all', limit = 50, cursor } = req.query;
  const lim = Math.max(1, Math.min(Number(limit) || 50, 100));

  const conv = await Conversation.findOne({
    _id: id,
    'members.user': actor.userId
  })
    .select('_id members')
    .lean();
  if (!conv) throwError('Tidak boleh akses percakapan ini', 403);

  const me = (conv.members || []).find(
    (m) => String(m.user) === String(actor.userId)
  );
  const hideBefore = me?.deletedAt ? new Date(me.deletedAt) : new Date(0);

  const find = {
    conversation: conv._id,
    attachments: { $exists: true, $ne: [] },
    createdAt: { $gt: hideBefore }
  };
  if (type === 'image') {
    find['attachments.contentType'] = { $regex: '^image/' };
  } else if (type === 'file') {
    find['attachments.contentType'] = { $not: /^image\// };
  }

  if (cursor) {
    const c = readCursor(cursor);
    if (c?.date && c?.id) {
      find.$or = [
        { createdAt: { $lt: c.date } },
        { createdAt: c.date, _id: { $lt: asId(c.id) } }
      ];
    }
  }

  const rows = await Message.find(find)
    .sort({ createdAt: -1, _id: -1 })
    .limit(lim + 1)
    .select('attachments sender createdAt')
    .populate({ path: 'sender', select: 'name email role' })
    .lean();

  const hasMore = rows.length > lim;
  const items = hasMore ? rows.slice(0, lim) : rows;

  const ref = items[items.length - 1];
  const nextCursor = hasMore && ref ? makeCursor(ref.createdAt, ref._id) : null;

  res.json({ items, nextCursor, hasMore });
});

const URL_REGEX = /(https?:\/\/[^\s]+)/gi;

const getConversationLinks = asyncHandler(async (req, res) => {
  const actor = await resolveChatActor(req);
  const { id } = req.params;
  const { limit = 50, cursor } = req.query;
  const lim = Math.max(1, Math.min(Number(limit) || 50, 100));

  const conv = await Conversation.findOne({
    _id: id,
    'members.user': actor.userId
  })
    .select('_id members')
    .lean();
  if (!conv) throwError('Tidak boleh akses percakapan ini', 403);

  const me = (conv.members || []).find(
    (m) => String(m.user) === String(actor.userId)
  );
  const hideBefore = me?.deletedAt ? new Date(me.deletedAt) : new Date(0);

  const find = {
    conversation: conv._id,
    text: { $ne: '' },
    createdAt: { $gt: hideBefore }
  };

  if (cursor) {
    const c = readCursor(cursor);
    if (c?.date && c?.id) {
      find.$or = [
        { createdAt: { $lt: c.date } },
        { createdAt: c.date, _id: { $lt: asId(c.id) } }
      ];
    }
  }

  const rows = await Message.find(find)
    .sort({ createdAt: -1, _id: -1 })
    .limit(lim + 1)
    .select('text sender createdAt conversation')
    .populate({ path: 'sender', select: 'name email role' })
    .lean();

  const withLinks = rows
    .map((m) => {
      const urls = (m.text || '').match(URL_REGEX) || [];
      if (urls.length === 0) return null;
      return {
        id: String(m._id),
        conversationId: String(m.conversation),
        sender: {
          id: String(m.sender?._id || m.sender),
          name: m.sender?.name || 'Tanpa Nama'
        },
        text: m.text,
        urls,
        createdAt: m.createdAt
      };
    })
    .filter(Boolean);

  const hasMore = rows.length > lim;
  const ref = withLinks[withLinks.length - 1];
  const nextCursor = hasMore && ref ? makeCursor(ref.createdAt, ref.id) : null;

  res.json({ items: withLinks, nextCursor, hasMore });
});

const deleteConversation = asyncHandler(async (req, res) => {
  const actor = await resolveChatActor(req);
  const { id } = req.params;
  const { mode = 'soft' } = req.query;

  const conv = await Conversation.findById(id);
  if (!conv) throwError('Percakapan tidak ditemukan', 404);

  const me = conv.members.find((m) => String(m.user) === String(actor.userId));
  if (!me) throwError('Bukan anggota', 403);

  if (mode === 'soft') {
    me.deletedAt = new Date();
    await conv.save();
    return res.json({ ok: true, mode: 'soft' });
  }

  if (mode === 'hard') {
    if (
      !['owner', 'admin'].includes(me.role) &&
      String(req.user.role || '').toLowerCase() !== 'admin'
    ) {
      throwError('Tidak punya izin menghapus percakapan global', 403);
    }

    const messages = await Message.find({ conversation: conv._id })
      .select('attachments')
      .lean();

    const allKeys = [];
    for (const msg of messages) {
      if (Array.isArray(msg.attachments)) {
        for (const a of msg.attachments) {
          if (a?.key) allKeys.push(a.key);
        }
      }
    }

    if (allKeys.length > 0) {
      await Promise.allSettled(allKeys.map((key) => deleteFile(key)));
    }

    await Message.deleteMany({ conversation: conv._id });
    await conv.deleteOne();

    return res.json({ ok: true, mode: 'hard', deletedFiles: allKeys.length });
  }

  throwError('Mode tidak valid. Gunakan soft atau hard.', 400);
});

const deleteMessage = asyncHandler(async (req, res) => {
  const actor = await resolveChatActor(req);
  const { id: messageId } = req.params;
  const { clientId } = req.body || {};

  let msg = null;

  if (messageId && isValidId(messageId)) {
    msg = await Message.findById(messageId)
      .populate('conversation', 'members') // _id tetap ikut
      .lean();
  }

  if (!msg && clientId) {
    msg = await Message.findOne({ clientId })
      .populate('conversation', 'members')
      .lean();
  }

  if (!msg) throwError('Pesan tidak ditemukan', 404);

  const conv = msg.conversation;
  const isMember = conv.members.some(
    (m) => String(m.user) === String(actor.userId)
  );
  if (!isMember) throwError('Bukan anggota percakapan', 403);

  if (
    String(msg.sender) !== String(actor.userId) &&
    String(req.user.role || '').toLowerCase() !== 'admin'
  ) {
    throwError('Tidak punya izin menghapus pesan ini', 403);
  }

  const allKeys = (msg.attachments || []).map((a) => a.key).filter(Boolean);
  if (allKeys.length > 0) {
    await Promise.allSettled(allKeys.map((key) => deleteFile(key)));
  }

  await Message.deleteOne({ _id: msg._id });

  const last = await Message.findOne({ conversation: conv._id })
    .sort({ createdAt: -1, _id: -1 })
    .select('_id createdAt conversation sender type text attachments')
    .lean();

  if (last) {
    await Conversation.updateOne(
      { _id: conv._id },
      { $set: { lastMessage: last._id, lastMessageAt: last.createdAt } }
    );
  } else {
    await Conversation.updateOne(
      { _id: conv._id },
      { $unset: { lastMessage: 1, lastMessageAt: 1 } }
    );
  }

  // siapkan payload conv:touch
  const touchPayload = {
    conversationId: String(conv._id),
    lastMessageAt: last?.createdAt || null,
    lastMessage: last
      ? {
          id: String(last._id),
          conversationId: String(last.conversation),
          sender: String(last.sender),
          type: last.type,
          text: last.text,
          attachments: last.attachments || [],
          createdAt: last.createdAt
        }
      : null
  };

  try {
    const nsp = global.io?.of('/chat');

    nsp?.to(String(conv._id)).emit('chat:delete', {
      conversationId: String(conv._id),
      messageId: String(msg._id),
      mode: 'hard'
    });

    nsp?.to(String(conv._id)).emit('conv:touch', touchPayload);
    for (const m of conv.members) {
      nsp?.to(String(m.user)).emit('conv:touch', touchPayload);
    }
  } catch {}

  res.json({
    ok: true,
    deleted: {
      messageId: String(msg._id),
      clientId: msg.clientId || clientId || null,
      attachments: allKeys.length
    }
  });
});

const getMessagesAround = asyncHandler(async (req, res) => {
  const actor = await resolveChatActor(req);
  const { id } = req.params;
  const { messageId, before = 50, after = 50 } = req.query;

  const beforeN = Math.max(0, Math.min(Number(before) || 30, 200));
  const afterN = Math.max(0, Math.min(Number(after) || 10, 200));

  if (!isValidId(id)) return throwError('conversationId tidak valid', 400);
  if (!isValidId(messageId)) return throwError('messageId tidak valid', 400);

  const conv = await Conversation.findOne({
    _id: id,
    'members.user': asId(actor.userId)
  })
    .select('_id members')
    .lean();
  if (!conv) return throwError('Tidak boleh akses percakapan ini', 403);

  const me = (conv.members || []).find(
    (m) => String(m.user) === String(actor.userId)
  );
  const hideBefore = me?.deletedAt ? new Date(me.deletedAt) : new Date(0);

  // Anchor harus berada SETELAH hideBefore
  const anchor = await Message.findOne({
    _id: messageId,
    conversation: id,
    createdAt: { $gt: hideBefore }
  })
    .select('_id sender type text attachments createdAt')
    .populate({ path: 'sender', select: 'name email role' });

  if (!anchor)
    return throwError('Pesan tidak ditemukan / di luar jangkauan', 404);

  const qBefore = {
    conversation: conv._id,
    createdAt: { $gt: hideBefore },
    $or: [
      { createdAt: { $lt: anchor.createdAt } },
      { createdAt: anchor.createdAt, _id: { $lt: anchor._id } }
    ]
  };
  const rowsBefore = await Message.find(qBefore)
    .sort({ createdAt: -1, _id: -1 })
    .limit(beforeN)
    .select('text sender createdAt attachments type')
    .populate({ path: 'sender', select: 'name email role' })
    .lean();

  const qAfter = {
    conversation: conv._id,
    createdAt: { $gt: hideBefore },
    $or: [
      { createdAt: { $gt: anchor.createdAt } },
      { createdAt: anchor.createdAt, _id: { $gt: anchor._id } }
    ]
  };
  const rowsAfter = await Message.find(qAfter)
    .sort({ createdAt: 1, _id: 1 })
    .limit(afterN)
    .select('text sender createdAt attachments type')
    .populate({ path: 'sender', select: 'name email role' })
    .lean();

  const items = [...rowsBefore.reverse(), anchor.toObject(), ...rowsAfter];

  const senders = [];
  for (const m of items) if (m.sender) senders.push(m.sender);
  const empMap = await buildEmpNameMapFromUsers(senders);
  for (const m of items)
    if (m.sender) m.sender.name = pickDisplayNameWithEmp(m.sender, empMap);

  const oldest = items[0];
  const newest = items[items.length - 1];

  const hasMoreBack = rowsBefore.length === beforeN;
  const hasMoreFwd = rowsAfter.length === afterN;

  const cursors = {
    back:
      hasMoreBack && oldest ? makeCursor(oldest.createdAt, oldest._id) : null,
    forward:
      hasMoreFwd && newest ? makeCursor(newest.createdAt, newest._id) : null
  };

  res.json({
    items,
    anchorId: String(anchor._id),
    cursors,
    hasMoreBack,
    hasMoreForward: hasMoreFwd
  });
});

const searchMessagesInConversation = asyncHandler(async (req, res) => {
  const actor = await resolveChatActor(req);
  const { id } = req.params;
  const { q, limit = 50, cursor } = req.query;
  const lim = Math.max(1, Math.min(Number(limit) || 50, 100));

  if (!q || !q.trim()) throwError('Query pencarian wajib diisi', 400);

  const conv = await Conversation.findOne({
    _id: id,
    'members.user': asId(actor.userId)
  })
    .select('_id members')
    .lean();
  if (!conv) throwError('Tidak boleh akses percakapan ini', 403);

  const me = (conv.members || []).find(
    (m) => String(m.user) === String(actor.userId)
  );
  const hideBefore = me?.deletedAt ? new Date(me.deletedAt) : new Date(0);

  const re = new RegExp(escapeRegex(q), 'i');

  const total = await Message.countDocuments({
    conversation: conv._id,
    text: { $regex: re },
    createdAt: { $gt: hideBefore }
  });

  const find = {
    conversation: conv._id,
    text: { $regex: re },
    createdAt: { $gt: hideBefore }
  };
  if (cursor) {
    const c = readCursor(cursor);
    if (c?.date && c?.id) {
      find.$or = [
        { createdAt: { $lt: c.date } },
        { createdAt: c.date, _id: { $lt: asId(c.id) } }
      ];
    }
  }

  const rows = await Message.find(find)
    .sort({ createdAt: -1, _id: -1 })
    .limit(lim + 1)
    .select('text sender createdAt attachments type')
    .populate({ path: 'sender', select: 'name email role' })
    .lean();

  const hasMore = rows.length > lim;
  const items = (hasMore ? rows.slice(0, lim) : rows).map((m) => ({
    ...m,
    highlight: makeSnippet(m.text, q)
  }));

  const last = items[items.length - 1];
  const nextCursor =
    hasMore && last ? makeCursor(last.createdAt, last._id) : null;

  res.json({
    totals: { messages: total },
    total,
    items,
    nextCursor,
    hasMore
  });
});

const searchMessagesGlobal = asyncHandler(async (req, res) => {
  const actor = await resolveChatActor(req);
  const { q, limit = 50, cursor, conv_limit = 10, per_conv = 3 } = req.query;
  const lim = Math.max(1, Math.min(Number(limit) || 50, 100));

  if (!q || !q.trim()) throwError('Query pencarian wajib diisi', 400);
  const re = new RegExp(escapeRegex(q), 'i');

  const myConvs = await Conversation.find({
    'members.user': actor.userId
  })
    .select('_id title type updatedAt members')
    .populate({ path: 'members.user', select: 'name email role' })
    .lean();

  if (!myConvs.length) {
    return res.json({
      totals: { messages: 0, conversations: 0 },
      totalMessages: 0,
      totalConversations: 0,
      convHits: [],
      items: [],
      nextCursor: null,
      hasMore: false
    });
  }

  const convHits = [];
  for (const c of myConvs) {
    const title = guessConvTitle(c, actor.userId);
    const nameMatch = (c.members || []).some(
      (m) =>
        String(m?.user?._id || m?.user) !== String(actor.userId) &&
        re.test(m?.user?.name || '')
    );
    if (re.test(title) || nameMatch) {
      convHits.push({
        conversationId: String(c._id),
        title,
        type: c.type,
        updatedAt: c.updatedAt
      });
    }
  }
  convHits.sort(
    (a, b) => (b.updatedAt?.getTime() || 0) - (a.updatedAt?.getTime() || 0)
  );
  const topConvHits = convHits.slice(0, Math.max(1, Number(conv_limit) || 10));
  const totalConvHits = convHits.length;

  const orConds = myConvs.map((c) => {
    const me = (c.members || []).find(
      (m) => String(m.user?._id || m.user) === String(actor.userId)
    );
    const hb = me?.deletedAt ? new Date(me.deletedAt) : new Date(0);
    return { conversation: c._id, createdAt: { $gt: hb } };
  });

  const baseMatch = { text: { $regex: re }, $or: orConds };

  const totalMessageHits = await Message.countDocuments(baseMatch);

  const find = { ...baseMatch };
  if (cursor) {
    const c = readCursor(cursor);
    if (c?.date && c?.id) {
      find.$and = [
        { $or: orConds },
        { text: { $regex: re } },
        {
          $or: [
            { createdAt: { $lt: c.date } },
            { createdAt: c.date, _id: { $lt: asId(c.id) } }
          ]
        }
      ];
      delete find.$or;
      delete find.text;
    }
  }

  const rows = await Message.find(find)
    .sort({ createdAt: -1, _id: -1 })
    .limit(lim + 1)
    .select('_id text sender createdAt conversation type')
    .populate({ path: 'sender', select: 'name email role' })
    .lean();

  const hasMore = rows.length > lim;
  const pageRows = hasMore ? rows.slice(0, lim) : rows;

  const convById = new Map(myConvs.map((c) => [String(c._id), c]));
  const perConvMax = Math.max(1, Math.min(Number(per_conv) || 3, 10));
  const groups = new Map();
  for (const m of pageRows) {
    const cid = String(m.conversation);
    if (!groups.has(cid)) {
      const conv = convById.get(cid);
      groups.set(cid, {
        conversationId: cid,
        title: guessConvTitle(conv, actor.userId),
        type: conv?.type,
        messages: []
      });
    }
    const g = groups.get(cid);
    if (g.messages.length < perConvMax) {
      g.messages.push({
        id: String(m._id),
        text: m.text,
        type: m.type,
        createdAt: m.createdAt,
        sender: m.sender,
        highlight: makeSnippet(m.text, q)
      });
    }
  }
  const items = Array.from(groups.values());

  const last = pageRows[pageRows.length - 1];
  const nextCursor =
    hasMore && last ? makeCursor(last.createdAt, last._id) : null;

  res.json({
    totals: { messages: totalMessageHits, conversations: totalConvHits },
    total: totalMessageHits,
    totalMessages: totalMessageHits,
    totalConversations: totalConvHits,
    convHits: topConvHits,
    items,
    nextCursor,
    hasMore
  });
});

/* ========= EXPORTS ========= */
module.exports = {
  listConversations,
  openCustomerChat,
  getMessages,
  updateMembers,
  updateConversation,
  createConversation,
  searchMessagesInConversation,
  searchMessagesGlobal,
  getContacts,
  getConversationMedia,
  getConversationLinks,
  deleteConversation,
  deleteMessage,
  getMessagesAround,
  // pins
  pinMessage,
  unpinMessage,
  listPinnedMessages
};
