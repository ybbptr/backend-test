const mongoose = require('mongoose');

const otpChallengeSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    type: {
      type: String,
      enum: ['EMAIL_UPDATE', 'PASSWORD_RESET', 'PASSWORD_CHANGE'],
      required: true
    },

    // EMAIL_UPDATE
    email: { type: String, trim: true, lowercase: true }, // email baru

    otpHash: { type: String, required: true },
    otpExpiresAt: { type: Date, required: true },
    resendAfter: { type: Date, required: true },
    attempts: { type: Number, default: 0 },
    resendCount: { type: Number, default: 0 },

    expiresAt: { type: Date, required: true }
  },
  { timestamps: true }
);

// Satu challenge aktif per user per type
otpChallengeSchema.index({ user: 1, type: 1 }, { unique: true });
otpChallengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('OtpChallenge', otpChallengeSchema);
