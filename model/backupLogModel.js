const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const backupLogSchema = new Schema(
  {
    type: {
      type: String,
      enum: ['daily', 'weekly', 'monthly'],
      required: true
    },
    bucket: { type: String, required: true },
    key: { type: String, required: true },
    size: { type: Number }, // byte
    status: { type: String, enum: ['success', 'failed'], default: 'success' },
    message: { type: String } // error message kalau gagal
  },
  { timestamps: true }
);

module.exports = model('BackupLog', backupLogSchema);
