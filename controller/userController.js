const asyncHandler = require('express-async-handler');
const User = require('../model/userModel');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const throwError = require('../utils/throwError');

const registerUser = asyncHandler(async (req, res) => {
  const { email, name, phone, password } = req.body || {};
  if (!email || !password || !name || !phone) {
    throwError('Semua field harus di isi!', 400);
  }

  const userExist = await User.findOne({ email });
  if (userExist) {
    throwError('Email tidak tersedia!', 400, 'email');
  }

  // Hashing password
  const hashedPassword = await bcrypt.hash(password, 10);

  // Create user
  const user = await User.create({
    name,
    email,
    phone,
    password: hashedPassword
  });

  // Checking if user is valid
  if (user) {
    const accessToken = jwt.sign(
      {
        user: {
          id: user._id,
          email: user.email
        }
      },
      process.env.ACCESS_TOKEN_SECRET,
      { expiresIn: '1h' }
    );

    res.status(201).json({
      user: {
        _id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role
      },
      accessToken
    });
  } else {
    throwError('User data tidak valid!', 400);
  }
});

const userLogin = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return throwError('Semua field harus di isi!', 400);
  }

  const user = await User.findOne({ email });
  if (!user) {
    res.status(404);
    throwError('Email tidak ditemukan!', 400, 'email');
  }
  // Compare password with hashedpassword
  const isPasswordValid =
    user && (await bcrypt.compare(password, user.password));

  if (isPasswordValid) {
    const accessToken = jwt.sign(
      {
        user: {
          email: user.email,
          id: user.id
        }
      },
      process.env.ACCESS_TOKEN_SECRET,
      { expiresIn: '1h' }
    );

    let userRole;
    const isAdmin =
      user.email === process.env.ADMIN_ACCESS &&
      (await bcrypt.compare(password, user.password));
    if (isAdmin) userRole = 'admin';
    else userRole = 'user';

    res.status(200).json({ accessToken, userRole });
  } else {
    throwError('Password invalid!', 401, 'password');
  }
});

const getCurrentUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id).select('-password -role');
  console.log(user);

  if (!user) {
    return throwError('User tidak ditemukan!', 404);
  }
  res.status(200).json(user);
});

const updateUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id).select('-password -role');
  if (!user) {
    res.status(404);
    throwError('User data tidak valid!', 400);
  }

  const { name, email, phone } = req.body || {};
  if (!name && !email && !phone) {
    return throwError('Isi setidaknya salah satu field!', 400);
  }

  // Build object update
  const updatedFields = {};
  if (name) updatedFields.name = name;
  if (email) updatedFields.email = email;
  if (phone) updatedFields.phone = phone;

  if (email) {
    const userExist = await User.findOne({ email });
    if (userExist && userExist.id !== user.id) {
      throwError('Email tidak tersedia!', 400, 'email');
    }
  }

  const updatedUser = await User.findByIdAndUpdate(user.id, updatedFields, {
    new: true,
    runValidators: true
  }).select('-password -role');
  res.status(200).json({
    message: 'Berhasil di update!',
    user: updatedUser
  });
});

const getAllUsers = asyncHandler(async (req, res) => {
  const admin = await User.findById(req.user.id).select('-password');

  if (!admin) {
    return throwError('Anda tidak memiliki izin untuk mengakses data!', 401);
  }

  const users = await User.find({ role: 'user' }).select('-password -role');
  res.status(200).json({ users });
});

const updatePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};

  const user = await User.findById(req.user.id).select('-role');
  if (!user) return throwError('Pengguna tidak ditemukan', 401);

  const hashedPassword = await bcrypt.hash(newPassword, 10);

  const isPasswordMatch = async (currentPassword, hashedPassword) => {
    return await bcrypt.compare(currentPassword, hashedPassword);
  };

  // Password tidak sesuai
  if (!(await isPasswordMatch(currentPassword, user.password)))
    return throwError('Password tidak sesuai', 400, 'password');

  // Password tidak boleh sama dengan yg sebelumnya
  if (await isPasswordMatch(newPassword, user.password))
    return throwError(
      'Password tidak boleh sama dengan sebelumnya!',
      400,
      'newPassword'
    );

  user.password = hashedPassword;
  await user.save();

  res.status(200).json({ message: 'Password berhasil diganti!' });
});

module.exports = {
  registerUser,
  userLogin,
  getCurrentUser,
  updateUser,
  getAllUsers,
  updatePassword
};
