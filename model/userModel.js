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
      required: function () {
        return this.authProvider === 'local';
      },
      validate: {
        validator: function (value) {
          if (!value) return true;
          return /\d/.test(value);
        },
        message: 'Password harus mengandung minimal satu angka'
      }
    },
    role: {
      type: String,
      enum: ['admin', 'user', 'karyawan'],
      default: 'user'
    },
    oauthProvider: {
      type: String,
      enum: ['google', 'facebook', 'local'],
      default: 'local'
    },
    emailVerified: { type: Boolean, default: false },
    oauthId: { type: String, default: null },
    refreshToken: { type: String, default: null }
  },

  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
