const mongoose = require('mongoose');
const { Schema, model, Types } = mongoose;

const MSG_TYPES = ['text', 'image', 'file', 'system'];

const AttachmentSchema = new Schema(
  {
    key: { type: String },
    contentType: { type: String },
    size: { type: Number },
    uploadedAt: { type: Date, default: Date.now }
  },
  { _id: false }
);

const MessageSchema = new Schema(
  {
    conversation: {
      type: Types.ObjectId,
      ref: 'Conversation',
      required: true,
      index: true
    },
    sender: { type: Types.ObjectId, ref: 'User', required: true },

    type: { type: String, enum: MSG_TYPES, default: 'text' },
    text: { type: String, trim: true, default: '' },
    attachments: { type: [AttachmentSchema], default: [] },

    clientId: { type: String, default: null }, // id dari FE (anti-dobel)
    editedAt: { type: Date, default: null },
    deletedAt: { type: Date, default: null },

    expireAt: { type: Date, default: null } // TTL sinkron untuk customer
  },
  { timestamps: true }
);

/* Index */
MessageSchema.index({ conversation: 1, createdAt: -1 });
MessageSchema.index({ conversation: 1, sender: 1, createdAt: 1 });
MessageSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });
MessageSchema.index({
  conversation: 1,
  createdAt: -1,
  'attachments.contentType': 1
});
MessageSchema.index(
  { conversation: 1, clientId: 1 },
  {
    unique: true,
    sparse: true,
    partialFilterExpression: { clientId: { $type: 'string' } }
  }
);

/* Sinkron TTL jika conversation=customer */
MessageSchema.pre('validate', async function (next) {
  try {
    if (this.expireAt || !this.conversation) return next();
    const Conversation = mongoose.model('Conversation');
    const conv = await Conversation.findById(this.conversation)
      .select('type expireAt createdAt')
      .lean();
    if (conv && conv.type === 'customer') {
      this.expireAt =
        conv.expireAt ??
        new Date(
          (conv.createdAt ? conv.createdAt.getTime() : Date.now()) +
            24 * 60 * 60 * 1000
        );
    }
    next();
  } catch (err) {
    next(err);
  }
});

module.exports = model('Message', MessageSchema);
