const mongoose = require('mongoose');
const { Schema, model, Types } = mongoose;

const AnnouncementSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    body: { type: String, default: '' },

    // durasi aktif
    activeFrom: { type: Date, default: Date.now },
    expiresAt: { type: Date, default: null }, // null = never expire

    // siapa yang bikin
    createdBy: { type: Types.ObjectId, ref: 'User', required: true }
  },
  { timestamps: true }
);

AnnouncementSchema.index({ activeFrom: 1, expiresAt: 1 });

module.exports = model('Announcement', AnnouncementSchema);
