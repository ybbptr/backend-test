const asyncHandler = require('express-async-handler');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const User = require('../model/userModel');
const throwError = require('../utils/throwError');
const generateTokens = require('../utils/generateToken');

const isProd = process.env.NODE_ENV === 'production';
const baseCookie = {
  httpOnly: true,
  secure: isProd,
  sameSite: isProd ? 'none' : 'lax'
};

const registerUser = asyncHandler(async (req, res) => {
  const { email, name, phone, password } = req.body || {};
  if (!email || !password || !name || !phone) {
    throwError('Semua field harus di isi!', 400);
  }

  const userExist = await User.findOne({ email });
  if (userExist) throwError('Email tidak tersedia!', 400, 'email');

  const hashedPassword = await bcrypt.hash(password, 10);
  const user = await User.create({
    name,
    email,
    phone,
    password: hashedPassword
  });

  if (!user) throwError('User data tidak valid!', 400);

  const { accessToken, refreshToken } = await generateTokens(user);

  res.clearCookie('refreshToken', { ...baseCookie, path: '/' });

  res
    .cookie('accessToken', accessToken, {
      ...baseCookie,
      path: '/', // global
      maxAge: 30 * 60 * 1000 // 30 menit
    })
    .cookie('refreshToken', refreshToken, {
      ...baseCookie,
      path: '/users', // prefix untuk /users/refresh-token
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 hari
    })
    .status(201)
    .json({ message: 'Daftar akun berhasil', role: user.role });
});

const loginUser = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });
  if (!user) throwError('Email tidak ditemukan', 401);

  const isValid = await bcrypt.compare(password, user.password);
  if (!isValid) throwError('Password invalid', 401);

  const { accessToken, refreshToken } = await generateTokens(user);

  res.clearCookie('refreshToken', { ...baseCookie, path: '/' });

  res
    .cookie('accessToken', accessToken, {
      ...baseCookie,
      path: '/',
      maxAge: 30 * 60 * 1000
    })
    .cookie('refreshToken', refreshToken, {
      ...baseCookie,
      path: '/users',
      maxAge: 7 * 24 * 60 * 60 * 1000
    })
    .json({ message: 'Login berhasil', role: user.role });
});

const getCurrentUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id).select('-password');
  if (!user) return throwError('User tidak ditemukan!', 404);
  res.status(200).json(user);
});

const updateUser = asyncHandler(async (req, res) => {
  const me = await User.findById(req.user.id).select('-password -role');
  if (!me) throwError('User data tidak valid!', 400);

  const { name, email, phone } = req.body || {};
  if (!name && !email && !phone) {
    return throwError('Isi setidaknya salah satu field!', 400);
  }

  if (email) {
    const exists = await User.findOne({ email });
    if (exists && exists.id !== me.id) {
      throwError('Email tidak tersedia!', 400, 'email');
    }
  }

  const updatedFields = {};
  if (name) updatedFields.name = name;
  if (email) updatedFields.email = email;
  if (phone) updatedFields.phone = phone;

  const updatedUser = await User.findByIdAndUpdate(me.id, updatedFields, {
    new: true,
    runValidators: true
  }).select('-password -role');

  res.status(200).json({ message: 'Berhasil di update!', user: updatedUser });
});

const getAllUsers = asyncHandler(async (req, res) => {
  const me = await User.findById(req.user.id).select('role');
  if (!me || me.role !== 'admin') {
    return throwError('Anda tidak memiliki izin untuk mengakses data!', 403);
  }
  const users = await User.find({ role: 'user' }).select('-password -role');
  res.status(200).json({ users });
});

const updatePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};

  const user = await User.findById(req.user.id).select('+password');
  if (!user) return throwError('Pengguna tidak ditemukan', 401);

  const isCurrentMatch = await bcrypt.compare(currentPassword, user.password);
  if (!isCurrentMatch)
    return throwError('Password tidak sesuai', 400, 'password');

  const isNewSame = await bcrypt.compare(newPassword, user.password);
  if (isNewSame)
    return throwError(
      'Password tidak boleh sama dengan sebelumnya!',
      400,
      'newPassword'
    );

  user.password = await bcrypt.hash(newPassword, 10);
  await user.save();

  res.status(200).json({ message: 'Password berhasil diganti!' });
});

const logoutUser = asyncHandler(async (req, res) => {
  try {
    const token = req.cookies?.refreshToken;
    if (token) {
      try {
        const payload = jwt.verify(token, process.env.REFRESH_TOKEN_SECRET);
        await User.findByIdAndUpdate(payload.user.id, { refreshToken: null });
      } catch (_) {
        // abaikan, tetap clear cookie
      }
    }

    res
      .clearCookie('accessToken', { ...baseCookie, path: '/' })
      .clearCookie('refreshToken', { ...baseCookie, path: '/users' })
      .json({ message: 'Berhasil logout' });
  } catch (_) {
    res
      .clearCookie('accessToken', { ...baseCookie, path: '/' })
      .clearCookie('refreshToken', { ...baseCookie, path: '/users' })
      .status(200)
      .json({ message: 'Berhasil logout' });
  }
});

const refreshToken = asyncHandler(async (req, res) => {
  const token = req.cookies?.refreshToken;
  if (!token) return res.status(401).json({ message: 'No refresh token' });

  try {
    const payload = jwt.verify(token, process.env.REFRESH_TOKEN_SECRET);

    const user = await User.findById(payload.user.id);
    if (!user || user.refreshToken !== token) {
      return res.status(401).json({ message: 'Refresh token invalid' });
    }

    const newAccessToken = jwt.sign(
      { user: { id: user._id, role: user.role } },
      process.env.ACCESS_TOKEN_SECRET,
      { expiresIn: '30m' }
    );

    res.cookie('accessToken', newAccessToken, {
      ...baseCookie,
      path: '/', // penting: global
      maxAge: 30 * 60 * 1000
    });

    return res.json({ message: 'Access token berhasil di refresh' });
  } catch (err) {
    res
      .clearCookie('accessToken', { ...baseCookie, path: '/' })
      .clearCookie('refreshToken', { ...baseCookie, path: '/users' });
    return res.status(401).json({ message: 'Refresh token invalid/expired' });
  }
});

module.exports = {
  registerUser,
  loginUser,
  getCurrentUser,
  updateUser,
  getAllUsers,
  updatePassword,
  logoutUser,
  refreshToken
};
