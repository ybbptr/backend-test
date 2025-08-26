const mongoose = require('mongoose');

const pendingRegistrationSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },
    name: { type: String, required: true },
    phone: { type: String, required: true },
    passwordHash: { type: String, required: true },

    otpHash: { type: String, required: true },
    otpExpiresAt: { type: Date, required: true },
    resendAfter: { type: Date, required: true },
    attempts: { type: Number, default: 0 },
    resendCount: { type: Number, default: 0 },

    expiresAt: { type: Date, required: true }
  },
  { timestamps: true }
);

pendingRegistrationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model(
  'PendingRegistration',
  pendingRegistrationSchema
);
