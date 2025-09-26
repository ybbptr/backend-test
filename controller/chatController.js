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

/* ========== LIST CONVERSATIONS (sidebar) ========== */
// GET /chat/conversations?type=&q=&limit=30&cursor=
const listConversations = asyncHandler(async (req, res) => {
  const actor = await resolveChatActor(req);
  const roleLower = String(req.user.role || '').toLowerCase();
  const { type, q, limit = 30, cursor } = req.query;
  const lim = Math.max(1, Math.min(Number(limit) || 30, 100));

  const match = { 'members.user': asId(actor.userId) };

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
      'type title members lastMessageAt expireAt createdBy createdAt updatedAt lastMessage'
    )
    .populate({ path: 'members.user', select: 'name email role' })
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

  // 4) Helper nama tampilan
  const pickDisplayName = (userDoc) => {
    if (!userDoc) return 'Tanpa Nama';
    const uid = String(userDoc._id || userDoc);
    if (userDoc.role === 'karyawan') {
      return empMap.get(uid) || userDoc.name || userDoc.email || 'Tanpa Nama';
    }
    // admin / user (customer) pakai nama user
    return userDoc.name || userDoc.email || 'Tanpa Nama';
  };

  // 5) Tambahkan displayName ke members & lastMessage, serta displayTitle utk non-group
  const myId = String(actor.userId);
  for (const c of items) {
    // members[i].displayName
    c.members = (c.members || []).map((m) => {
      const u = m.user;
      return {
        ...m,
        displayName: pickDisplayName(u)
      };
    });

    // lastMessage.displaySenderName
    if (c.lastMessage?.sender) {
      c.lastMessage.displaySenderName = pickDisplayName(c.lastMessage.sender);
    }

    // displayTitle untuk direct/customer (pakai lawan bicara)
    if (c.type !== 'group') {
      const others = (c.members || []).filter(
        (m) => String(m.user?._id || m.user) !== myId
      );
      const other = others[0];
      c.displayTitle =
        other?.displayName || pickDisplayName(other?.user) || 'Tanpa Nama';
    }
  }

  const ref = items[items.length - 1];
  const refTime = ref?.lastMessageAt || ref?.createdAt;
  const nextCursor =
    hasMore && ref && refTime ? makeCursor(refTime, ref._id) : null;

  res.json({ items, nextCursor, hasMore });
});
/* ========== CREATE CONVERSATION (direct/group) ========== */
// POST /chat/conversations
const createConversation = asyncHandler(async (req, res) => {
  const actor = await resolveChatActor(req);
  const roleLower = String(req.user.role || '').toLowerCase();
  const { type, title, memberIds } = req.body || {};

  if (!type) throwError('type wajib diisi', 400);
  if (!Array.isArray(memberIds) || memberIds.length < 1) {
    throwError('memberIds wajib diisi', 400);
  }

  // Customer tidak boleh create di endpoint ini
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

  const conv = await Conversation.create({
    type,
    title: type === 'group' ? title : undefined,
    createdBy: asId(actor.userId),
    members
  });

  res.status(201).json(conv);
});

/* ========== UPDATE CONVERSATION (rename/pin) ========== */
// PATCH /chat/conversations/:id
const updateConversation = asyncHandler(async (req, res) => {
  const actor = await resolveChatActor(req);
  const { id } = req.params;
  const { title, pinned } = req.body || {};

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

  if (typeof pinned === 'boolean') {
    me.pinned = pinned;
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
        lastReadAt: null,
        pinned: false
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

/* ========== GET MESSAGES (paging) ========== */
// GET /chat/conversations/:id/messages
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
        find.$or = [
          { createdAt: { $gt: c.date } },
          { createdAt: c.date, _id: { $gt: asId(c.id) } }
        ];
      }
    }
  }

  const sort =
    dir === 'back' ? { createdAt: -1, _id: -1 } : { createdAt: 1, _id: 1 };
  const rows = await Message.find(find)
    .sort(sort)
    .limit(lim + 1)
    .select('text sender createdAt attachments')
    .populate({ path: 'sender', select: 'name email role' })
    .lean();

  const hasMore = rows.length > lim;
  const items = hasMore ? rows.slice(0, lim) : rows;
  const normalized = dir === 'back' ? items.reverse() : items;

  const last = normalized[normalized.length - 1];
  const nextCursor =
    hasMore && last ? makeCursor(last.createdAt, last._id) : null;

  res.json({ items: normalized, nextCursor, hasMore });
});

/* ========== OPEN CUSTOMER CHAT (TTL 24h) ========== */
// POST /chat/customer/open
const openCustomerChat = asyncHandler(async (req, res) => {
  if (String(req.user.role || '').toLowerCase() !== 'user') {
    throwError('Hanya customer yang bisa membuka chat ini', 403);
  }

  const userId = asId(req.user.id);

  const adminUser = await User.findOne({ role: 'admin' }).lean();
  if (!adminUser) throwError('Tidak ada admin tersedia', 404);

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

module.exports = {
  listConversations,
  openCustomerChat,
  getMessages,
  updateMembers,
  updateConversation,
  createConversation,
  getContacts
};
