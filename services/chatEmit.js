const { Types } = require('mongoose');
const Conversation = require('../model/conversationModel');
const Message = require('../model/messageModel');

function mapMessage(m) {
  return {
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
  };
}

function safeEmitNewMessage(dto) {
  try {
    const io = global.io;
    if (!io || typeof io.of !== 'function') return;
    const nsp = io.of('/chat');
    nsp.to(dto.conversationId).emit('chat:new', dto);
    nsp.to(dto.conversationId).emit('chat:delivered', {
      conversationId: dto.conversationId,
      messageIds: [dto.id],
      at: new Date()
    });
  } catch {}
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
  if (!Types.ObjectId.isValid(conversationId)) {
    throw new Error('conversationId tidak valid');
  }
  if (!Types.ObjectId.isValid(senderId)) {
    throw new Error('senderId tidak valid');
  }

  const conv = await Conversation.findById(conversationId);
  if (!conv) throw new Error('Percakapan tidak ditemukan');

  const hasContent =
    String(text || '').trim().length > 0 ||
    (Array.isArray(attachments) && attachments.length > 0);

  if (!hasContent) throw new Error('Pesan kosong');

  if (clientId) {
    const dup = await Message.findOne({ conversation: conv._id, clientId });
    if (dup) {
      const dto = mapMessage(dup);
      safeEmitNewMessage(dto);
      return dto;
    }
  }

  const files = await normalizeAttachments(attachments);

  const msg = await Message.create({
    conversation: conv._id,
    sender: new mongoose.ObjectId(senderId),
    type,
    text,
    attachments: files,
    clientId
  });

  conv.lastMessage = msg._id;
  conv.lastMessageAt = msg.createdAt;
  await conv.save();

  const dto = mapMessage(msg);
  safeEmitNewMessage(dto);
  return dto;
}

module.exports = {
  chatEmit
};
