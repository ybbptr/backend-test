'use strict';

const mongoose = require('mongoose');
const { Schema, model, Types } = mongoose;

const CONV_TYPES = ['direct', 'group', 'announcement', 'customer'];
const MEMBER_ROLES = ['owner', 'admin', 'member'];

const MemberSchema = new Schema(
  {
    user: { type: Types.ObjectId, ref: 'UserManagement', required: true },
    role: { type: String, enum: MEMBER_ROLES, default: 'member' },
    lastReadAt: { type: Date, default: null },
    pinned: { type: Boolean, default: false }
  },
  { _id: false }
);

const ConversationSchema = new Schema(
  {
    type: { type: String, enum: CONV_TYPES, required: true },
    title: { type: String, trim: true }, // wajib di FE untuk group/announcement
    createdBy: { type: Types.ObjectId, ref: 'User' },

    members: {
      type: [MemberSchema],
      default: [],
      validate: {
        validator(arr) {
          const ids = arr.map((m) => String(m.user));
          return ids.length === new Set(ids).size; // unik
        },
        message: 'Anggota percakapan tidak boleh duplikat.'
      }
    },

    lastMessage: { type: Types.ObjectId, ref: 'Message' },
    lastMessageAt: { type: Date },

    // TTL untuk customer
    expireAt: { type: Date, default: null },

    // Kunci unik direct "<id1>:<id2>" (urut)
    memberKey: { type: String, default: null, index: true }
  },
  { timestamps: true }
);

/* Index */
ConversationSchema.index({ 'members.user': 1 });
ConversationSchema.index({ lastMessageAt: -1 });
ConversationSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });
ConversationSchema.index(
  { type: 1, memberKey: 1 },
  {
    unique: true,
    partialFilterExpression: { type: 'direct', memberKey: { $type: 'string' } }
  }
);

/* Hook: set memberKey direct + TTL customer */
ConversationSchema.pre('validate', function (next) {
  if (this.type === 'direct') {
    const ids = (this.members || []).map((m) => String(m.user)).sort();
    if (ids.length !== 2)
      return next(new Error('Percakapan direct harus berisi tepat 2 anggota.'));
    this.memberKey = `${ids[0]}:${ids[1]}`;
    if (!this.title) this.title = undefined; // direct tanpa title
  } else {
    this.memberKey = null;
  }

  if (this.type === 'customer' && !this.expireAt) {
    this.expireAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // +24 jam
  }

  next();
});

module.exports = model('Conversation', ConversationSchema);
