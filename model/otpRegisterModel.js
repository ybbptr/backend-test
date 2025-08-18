const mongoose = require('mongoose');

const otpRegisterSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    phone: { type: String, required: true },
    password: { type: String, required: true },
    otp: { type: String, required: true },
    expiredAt: { type: Date, required: true }
  },
  { timestamps: true }
);

module.exports = mongoose.model('OtpRegister', otpRegisterSchema);
