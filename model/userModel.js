const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: [true, 'Email wajib diisi'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/.+\@.+\..+/, 'Mohon isi alamat email yang valid']
    },
    name: {
      type: String,
      required: [true, 'Nama wajib diisi'],
      trim: true
    },
    phone: {
      type: String,
      required: [true, 'Nomor telepon wajib diisi'],
      trim: true,
      minlength: [10, 'Nomor telepon minimal 10 digit'],
      maxlength: [15, 'Nomor telepon maksimal 15 digit'],
      validate: {
        validator: function (value) {
          return /^[0-9]+$/.test(value);
        },
        message: 'Nomor telepon hanya boleh berisi angka'
      }
    },
    password: {
      type: String,
      minlength: [8, 'Password minimal 8 karakter'],
      validate: {
        validator: function (value) {
          if (!value) return true; // skip validasi jika password kosong (untuk OAuth)
          return /\d/.test(value);
        },
        message: 'Password harus mengandung minimal satu angka'
      }
    },
    role: {
      type: String,
      enum: ['admin', 'user'],
      default: 'user'
    },
    oauthProvider: {
      type: String,
      enum: ['google', 'facebook'],
      default: null
    },
    oauthId: { type: String, default: null } // ID dari provider OAuth
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
