// utils/chatEmit.js
'use strict';

const { Types } = require('mongoose');
const Conversation = require('../model/conversationModel');
const Message = require('../model/messageModel');

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

function emitBoth(nsp, convId, dto) {
  nsp?.to(String(convId)).emit('chat:new', dto);
  nsp?.to(String(convId)).emit('chat:delivered', {
    conversationId: String(convId),
    messageIds: [dto.id],
    at: new Date()
  });
}

async function normalizeAttachments(attachments = []) {
  return (attachments || [])
    .map((a) => ({
      key: a?.key,
      contentType: a?.contentType,
      size: typeof a?.size === 'number' ? a.size : 0,
      uploadedAt: a?.uploadedAt ? new Date(a.uploadedAt) : new Date()
    }))
    .filter((a) => a.key && a.contentType);
}

async function chatEmit({
  conversationId,
  senderId,
  text = '',
  type = 'text',
  attachments = [],
  clientId = null
}) {
  if (!Types.ObjectId.isValid(conversationId))
    throw new Error('conversationId tidak valid');
  if (!Types.ObjectId.isValid(senderId))
    throw new Error('senderId tidak valid');

  // pastikan conversation ada & sender adalah anggota
  const conv = await Conversation.findOne({
    _id: conversationId,
    'members.user': senderId
  });
  if (!conv) throw new Error('Percakapan tidak ditemukan / bukan anggota');

  const hasContent =
    String(text || '').trim() ||
    (Array.isArray(attachments) && attachments.length);
  if (!hasContent) throw new Error('Pesan kosong');

  const nsp = (global.io?.of && global.io.of('/chat')) || global.io || null;

  // Idempotent by clientId
  if (clientId) {
    const dup = await Message.findOne({
      conversation: conversationId,
      clientId
    });
    if (dup) {
      const dto = mapMessage(dup);
      try {
        emitBoth(nsp, conversationId, dto);
      } catch (_) {}
      return { ok: true, message: dto };
    }
  }

  const files = await normalizeAttachments(attachments);

  const msg = await Message.create({
    conversation: conversationId,
    sender: senderId, // biar Mongoose cast otomatis
    type,
    text,
    attachments: files,
    clientId
  });

  await Conversation.updateOne(
    { _id: conversationId },
    { $set: { lastMessage: msg._id, lastMessageAt: msg.createdAt } }
  );

  const dto = mapMessage(msg);
  try {
    emitBoth(nsp, conversationId, dto);
  } catch (_) {}

  return { ok: true, message: dto };
}

module.exports = { chatEmit };
