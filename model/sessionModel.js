const mongoose = require('mongoose');

const SessionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Types.ObjectId, index: true, required: true },
    sid: { type: String, unique: true, index: true }, // session id (jti)
    currentRtHash: { type: String, required: true },
    prevRtHash: { type: String, default: null },
    remember: { type: Boolean, default: false },
    ua: String,
    ip: String,
    expiresAt: { type: Date, index: true }, // TTL
    revokedAt: Date,
    replacedAt: Date
  },
  { timestamps: true }
);

SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('Session', SessionSchema);
