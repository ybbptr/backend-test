'use strict';

const mongoose = require('mongoose');
const asyncHandler = require('express-async-handler');
const throwError = require('../utils/throwError');
const { resolveChatActor } = require('../utils/chatActor');

const Conversation = require('../model/conversationModel');
const Message = require('../model/messageModel');
const Employee = require('../model/employeeModel');
const User = require('../model/userModel');

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

/* ================== Helpers: nama karyawan dari Employee ================== */
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

function pickDisplayNameWithEmp(userDoc, empMap) {
  if (!userDoc) return 'Tanpa Nama';
  const uid = getUid(userDoc);
  const role = String(userDoc.role || '').toLowerCase();

  if (role === 'karyawan') {
    return empMap.get(uid) || userDoc.name || userDoc.email || 'Tanpa Nama';
  }
  if (role === 'bot') {
    return userDoc.name || 'Soilab Bot';
  }
  return userDoc.name || userDoc.email || 'Tanpa Nama';
}

/* ========== LIST CONVERSATIONS (sidebar) ========== */
// GET /chat/conversations?type=&q=&limit=30&cursor=
const listConversations = asyncHandler(async (req, res) => {
  const actor = await resolveChatActor(req);
  const roleLower = String(req.user.role || '').toLowerCase();
  const { type, q, limit = 50, cursor } = req.query;
  const lim = Math.max(1, Math.min(Number(limit) || 30, 100));

  const match = {
    members: {
      $elemMatch: {
        user: asId(actor.userId),
        $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }]
      }
    }
  };

  if (roleLower === 'user') {
    match.type = 'customer';
  } else if (type) {
    match.type = type;
  }

  if (q) match.title = { $regex: q, $options: 'i' };

  if (cursor) {
    const c = readCursor(cursor);
    if (c?.date && c?.id) {
      match.$or = [
        { lastMessageAt: { $lt: c.date } },
        { lastMessageAt: c.date, _id: { $lt: asId(c.id) } }
      ];
    }
  }

  const rows = await Conversation.find(match)
    .sort({ lastMessageAt: -1, _id: -1 })
    .limit(lim + 1)
    .select(
      'type title members lastMessageAt expireAt createdBy createdAt updatedAt lastMessage pinnedMessages'
    )
    .populate({
      path: 'members.user',
      select: 'name email role',
      options: { retainNullValues: true }
    })
    .populate({
      path: 'lastMessage',
      select: 'text sender createdAt attachments',
      populate: { path: 'sender', select: 'name email role' }
    })
    .lean();

  const hasMore = rows.length > lim;
  const items = hasMore ? rows.slice(0, lim) : rows;

  const karyawanIds = new Set();
  for (const c of items) {
    for (const m of c.members || []) {
      const u = m.user;
      if (u && u.role === 'karyawan') karyawanIds.add(String(u._id || u));
    }
    const s = c.lastMessage?.sender;
    if (s && s.role === 'karyawan') karyawanIds.add(String(s._id || s));
  }

  let empMap = new Map();
  if (karyawanIds.size > 0) {
    const emps = await Employee.find({ user: { $in: Array.from(karyawanIds) } })
      .select('user name')
      .lean();
    empMap = new Map(emps.map((e) => [String(e.user), e.name]));
  }

  // Tambah displayName & displayTitle
  const myId = String(actor.userId);
  for (const c of items) {
    c.members = (c.members || []).map((m) => {
      const u = m.user;
      return { ...m, displayName: pickDisplayNameWithEmp(u, empMap) };
    });

    if (c.lastMessage?.sender) {
      c.lastMessage.displaySenderName = pickDisplayNameWithEmp(
        c.lastMessage.sender,
        empMap
      );
    }

    if (c.type !== 'group') {
      const others = (c.members || []).filter(
        (m) => String(m.user?._id || m.user) !== myId
      );
      const other = others[0];
      c.displayTitle =
        other?.displayName ||
        pickDisplayNameWithEmp(other?.user, empMap) ||
        'Tanpa Nama';
    }
  }

  // Hitung unreadCount
  const myLastReadByConv = new Map();
  for (const c of items) {
    const me = (c.members || []).find(
      (m) => String(m.user?._id || m.user) === myId
    );
    myLastReadByConv.set(String(c._id), me?.lastReadAt || null);
  }

  await Promise.all(
    items.map(async (c) => {
      const lastReadAt = myLastReadByConv.get(String(c._id));
      const query = {
        conversation: c._id,
        sender: { $ne: asId(actor.userId) },
        $or: [{ deletedAt: { $exists: false } }, { deletedAt: null }]
      };
      if (lastReadAt) query.createdAt = { $gt: new Date(lastReadAt) };
      c.unreadCount = await Message.countDocuments(query);
    })
  );

  const ref = items[items.length - 1];
  const refTime = ref?.lastMessageAt || ref?.createdAt;
  const nextCursor =
    hasMore && ref && refTime ? makeCursor(refTime, ref._id) : null;

  res.json({ items, nextCursor, hasMore });
});

/* ========== CREATE CONVERSATION (direct/group) ========== */
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
    }).lean();
    if (existing) return res.status(200).json(existing);
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

  // Populate supaya FE langsung dapet data lengkap
  // Populate supaya FE langsung dapet data lengkap
  await conv.populate({ path: 'members.user', select: 'name email role' });
  conv = conv.toObject(); // opsional: biar plain object

  // Emit realtime ke semua member
  if (global.io) {
    const nsp = global.io.of('/chat');
    for (const m of members) {
      nsp.to(String(m.user)).emit('conv:new', conv);
    }
  }

  res.status(201).json(conv);
});

/* ========== UPDATE CONVERSATION (rename) ========== */
// PATCH /chat/conversations/:id
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

/* ========== UPDATE MEMBERS (add/remove/role) ========== */
// PATCH /chat/conversations/:id/members
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
  }).select('_id');
  if (!conv) throwError('Tidak boleh akses percakapan ini', 403);

  const find = { conversation: asId(id) };

  if (cursor) {
    const c = readCursor(cursor);
    if (c?.date && c?.id) {
      if (dir === 'back') {
        find.$or = [
          { createdAt: { $lt: c.date } },
          { createdAt: c.date, _id: { $lt: asId(c.id) } }
        ];
      } else {
        // ambil yang LEBIH BARU dari anchor
        find.$or = [
          { createdAt: { $gt: c.date } },
          { createdAt: c.date, _id: { $gt: asId(c.id) } }
        ];
      }
    }
  }

  // sort sesuai arah fetch
  const sort =
    dir === 'back' ? { createdAt: -1, _id: -1 } : { createdAt: 1, _id: 1 };

  const rows = await Message.find(find)
    .sort(sort)
    .limit(lim + 1)
    .select('text sender createdAt attachments deletedAt type')
    .populate({ path: 'sender', select: 'name email role' })
    .lean();

  const hasMore = rows.length > lim;
  const items = hasMore ? rows.slice(0, lim) : rows;

  // untuk dir=back kita balikin urut lama→baru
  const normalized = dir === 'back' ? items.reverse() : items;

  // override nama karyawan pada sender (pakai Employee)
  const senders = [];
  for (const m of normalized) if (m.sender) senders.push(m.sender);
  const empMap = await buildEmpNameMapFromUsers(senders);
  for (const m of normalized) {
    if (m.sender) {
      m.sender.name = pickDisplayNameWithEmp(m.sender, empMap);
    }
  }

  // === KUNCI PERBAIKAN: pakai anchor yang benar ===
  // - dir=back  : anchor = item PALING LAMA di halaman (index 0 setelah reverse)
  // - dir=forward: anchor = item PALING BARU di halaman (index terakhir)
  let anchor = null;
  if (hasMore && normalized.length) {
    anchor = dir === 'back' ? normalized[0] : normalized[normalized.length - 1];
  }

  const nextCursor = anchor ? makeCursor(anchor.createdAt, anchor._id) : null;

  res.json({ items: normalized, nextCursor, hasMore });
});

/* ========== OPEN CUSTOMER CHAT (TTL 24h) ========== */
// POST /chat/customer/open
const openCustomerChat = asyncHandler(async (req, res) => {
  if (String(req.user.role || '').toLowerCase() !== 'user') {
    throwError('Hanya customer yang bisa membuka chat ini', 403);
  }

  const userId = asId(req.user.id);

  // ambil admin yang ditandai sebagai inbox customer
  const adminUser = await User.findOne({
    role: 'admin',
    isCustomerInbox: true
  }).lean();
  if (!adminUser) throwError('Tidak ada admin inbox customer', 404);

  // cek apakah sudah ada conv customer
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

    // emit conv:new realtime supaya admin langsung lihat
    if (global.io) {
      const nsp = global.io.of('/chat');
      nsp.to(String(adminUser._id)).emit('conv:new', conv);
    }
  }

  res.json({ conversationId: conv._id });
});

/* ========== CONTACTS (karyawan & admin, exclude diri sendiri) ========== */
// GET /chat/contacts
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

  const contacts = [...empContacts, ...adminContacts];
  res.json({ contacts });
});

/* ================== PIN (GLOBAL) ================== */
// Izin: group → owner/admin/grand admin; direct → semua anggota; customer → admin global
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

// POST /chat/conversations/:id/pin  { messageId }
const pinMessage = asyncHandler(async (req, res) => {
  const actor = await resolveChatActor(req);
  const { id } = req.params;
  const { messageId } = req.body || {};

  if (!isValidId(id)) throwError('conversationId tidak valid', 400);
  if (!isValidId(messageId)) throwError('messageId tidak valid', 400);

  const conv = await Conversation.findOne({
    _id: id,
    'members.user': asId(actor.userId)
  }).select('type members pinnedMessages');
  if (!conv) throwError('Percakapan tidak ditemukan / bukan anggota', 403);

  if (!canManagePin(conv, req.user.role, actor.userId)) {
    throwError('Tidak punya izin untuk pin pesan', 403);
  }

  const msg = await Message.findOne({
    _id: messageId,
    conversation: id,
    $or: [{ deletedAt: { $exists: false } }, { deletedAt: null }]
  })
    .select('_id sender type text attachments createdAt')
    .populate({ path: 'sender', select: 'name email role' })
    .lean();
  if (!msg) throwError('Pesan tidak ditemukan / tidak bisa dipin', 404);

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

  // Override nama karyawan (sender & pinnedBy)
  const pinnedByUserLike = {
    _id: actor.userId,
    role: req.user.role,
    name: actor.name || null
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

  // Broadcast via socket
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

// DELETE /chat/conversations/:id/pin/:messageId
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

// GET /chat/conversations/:id/pins
const listPinnedMessages = asyncHandler(async (req, res) => {
  const actor = await resolveChatActor(req);
  const { id } = req.params;

  if (!isValidId(id)) throwError('conversationId tidak valid', 400);

  const conv = await Conversation.findOne({
    _id: id,
    'members.user': asId(actor.userId)
  })
    .select('pinnedMessages')
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

  // Build empMap untuk sender & pinnedBy
  const userLikes = [];
  for (const p of conv.pinnedMessages || []) {
    if (p.message?.sender) userLikes.push(p.message.sender);
    if (p.pinnedBy) userLikes.push(p.pinnedBy);
  }
  const empMap = await buildEmpNameMapFromUsers(userLikes);

  const items = (conv.pinnedMessages || [])
    .filter((p) => !p.message?.deletedAt)
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

// GET /chat/conversations/:id/media
const getConversationMedia = asyncHandler(async (req, res) => {
  const actor = await resolveChatActor(req);
  const { id } = req.params;
  const { type = 'all', limit = 50, cursor } = req.query;
  const lim = Math.max(1, Math.min(Number(limit) || 50, 100));

  // cek membership
  const conv = await Conversation.findOne({
    _id: id,
    'members.user': actor.userId
  }).select('_id');
  if (!conv) throwError('Tidak boleh akses percakapan ini', 403);

  // query filter
  const find = {
    conversation: conv._id,
    attachments: { $exists: true, $ne: [] }
  };
  if (type === 'image') {
    find['attachments.contentType'] = { $regex: '^image/' };
  } else if (type === 'file') {
    find['attachments.contentType'] = { $not: /^image\// };
  }

  // cursor pagination
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

// GET /chat/conversations/:id/links
const getConversationLinks = asyncHandler(async (req, res) => {
  const actor = await resolveChatActor(req);
  const { id } = req.params;
  const { limit = 50, cursor } = req.query;
  const lim = Math.max(1, Math.min(Number(limit) || 50, 100));

  // cek membership
  const conv = await Conversation.findOne({
    _id: id,
    'members.user': actor.userId
  }).select('_id');
  if (!conv) throwError('Tidak boleh akses percakapan ini', 403);

  // query pesan yang ada text
  const find = { conversation: conv._id, text: { $ne: '' } };

  // cursor pagination
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
    .select('text sender createdAt')
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
      String(actor.role).toLowerCase() !== 'admin'
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

const getMessagesAround = asyncHandler(async (req, res) => {
  const actor = await resolveChatActor(req);
  const { id } = req.params;
  const { messageId, before = 30, after = 10 } = req.query;

  const beforeN = Math.max(0, Math.min(Number(before) || 30, 200));
  const afterN = Math.max(0, Math.min(Number(after) || 10, 200));

  if (!isValidId(id)) return throwError('conversationId tidak valid', 400);
  if (!isValidId(messageId)) return throwError('messageId tidak valid', 400);

  const conv = await Conversation.findOne({
    _id: id,
    'members.user': asId(actor.userId)
  }).select('_id');
  if (!conv) return throwError('Tidak boleh akses percakapan ini', 403);

  const anchor = await Message.findOne({
    _id: messageId,
    conversation: id,
    $or: [{ deletedAt: { $exists: false } }, { deletedAt: null }]
  })
    .select('_id sender type text attachments createdAt deletedAt')
    .populate({ path: 'sender', select: 'name email role' });

  if (!anchor) return throwError('Pesan tidak ditemukan / sudah dihapus', 404);

  const qBefore = {
    conversation: conv._id,
    $or: [
      { createdAt: { $lt: anchor.createdAt } },
      { createdAt: anchor.createdAt, _id: { $lt: anchor._id } }
    ]
  };
  const rowsBefore = await Message.find(qBefore)
    .sort({ createdAt: -1, _id: -1 })
    .limit(beforeN)
    .select('text sender createdAt attachments deletedAt type')
    .populate({ path: 'sender', select: 'name email role' })
    .lean();

  const qAfter = {
    conversation: conv._id,
    $or: [
      { createdAt: { $gt: anchor.createdAt } },
      { createdAt: anchor.createdAt, _id: { $gt: anchor._id } }
    ]
  };
  const rowsAfter = await Message.find(qAfter)
    .sort({ createdAt: 1, _id: 1 })
    .limit(afterN)
    .select('text sender createdAt attachments deletedAt type')
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
      hasMoreBack && oldest ? makeCursor(oldest.createdAt, oldest._id) : null, // untuk load lebih lama (dir=back)
    forward:
      hasMoreFwd && newest ? makeCursor(newest.createdAt, newest._id) : null // untuk load lebih baru (dir=fwd)
  };

  res.json({
    items,
    anchorId: String(anchor._id),
    cursors,
    hasMoreBack,
    hasMoreForward: hasMoreFwd
  });
});

// GET /chat/conversations/:id/search?q=keyword&limit=50&cursor=
const searchMessagesInConversation = asyncHandler(async (req, res) => {
  const actor = await resolveChatActor(req);
  const { id } = req.params;
  const { q, limit = 50, cursor } = req.query;
  const lim = Math.max(1, Math.min(Number(limit) || 50, 100));

  if (!q || !q.trim()) throwError('Query pencarian wajib diisi', 400);

  // cek membership
  const conv = await Conversation.findOne({
    _id: id,
    'members.user': asId(actor.userId)
  }).select('_id');
  if (!conv) throwError('Tidak boleh akses percakapan ini', 403);

  const find = {
    conversation: conv._id,
    text: { $regex: q, $options: 'i' }
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
  const items = hasMore ? rows.slice(0, lim) : rows;

  const last = items[items.length - 1];
  const nextCursor =
    hasMore && last ? makeCursor(last.createdAt, last._id) : null;

  res.json({ items, nextCursor, hasMore });
});

// GET /chat/search?q=keyword&limit=50&cursor=
const searchMessagesGlobal = asyncHandler(async (req, res) => {
  const actor = await resolveChatActor(req);
  const { q, limit = 50, cursor } = req.query;
  const lim = Math.max(1, Math.min(Number(limit) || 50, 100));

  if (!q || !q.trim()) throwError('Query pencarian wajib diisi', 400);

  // cari semua conversation yg user ikuti
  const myConvs = await Conversation.find({
    'members.user': actor.userId
  }).select('_id title type members');

  if (!myConvs.length)
    return res.json({ items: [], nextCursor: null, hasMore: false });

  const convIds = myConvs.map((c) => c._id);

  const find = {
    conversation: { $in: convIds },
    text: { $regex: q, $options: 'i' }
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
    .select('text sender createdAt conversation type')
    .populate({ path: 'sender', select: 'name email role' })
    .lean();

  const hasMore = rows.length > lim;
  const items = hasMore ? rows.slice(0, lim) : rows;

  const convMap = new Map(myConvs.map((c) => [String(c._id), c]));
  const grouped = {};
  for (const m of items) {
    const cid = String(m.conversation);
    if (!grouped[cid]) {
      const conv = convMap.get(cid);
      grouped[cid] = {
        conversationId: cid,
        title: conv?.title || 'Tanpa Nama',
        type: conv?.type,
        messages: []
      };
    }
    grouped[cid].messages.push({
      id: String(m._id),
      text: m.text,
      type: m.type,
      createdAt: m.createdAt,
      sender: m.sender
    });
  }

  const last = items[items.length - 1];
  const nextCursor =
    hasMore && last ? makeCursor(last.createdAt, last._id) : null;

  res.json({ items: Object.values(grouped), nextCursor, hasMore });
});

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
  getMessagesAround,
  // pins
  pinMessage,
  unpinMessage,
  listPinnedMessages
};
