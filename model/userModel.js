const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/.+\@.+\..+/, 'Please fill a valid email address']
    },
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true
    },
    phone: {
      type: String,
      required: [true, 'Phone number is required'],
      trim: true,
      minlength: [10, 'Phone number must be at least 10 digits'],
      maxlength: [15, 'Phone number must not be more than 15 digits'],
      validate: {
        validator: function (value) {
          return /^[0-9]+$/.test(value);
        },
        message: 'Phone number must contain only numbers'
      }
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [8, 'Password must be at least 8 characters'],
      validate: {
        validator: function (value) {
          return /\d/.test(value);
        },
        message: 'Password must contain at least one number'
      }
    }
  },
  { timestamps: true }
);

const User = mongoose.model('user', userSchema);

module.exports = User;
