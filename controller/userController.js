const asyncHandler = require('express-async-handler');
const User = require('../model/userModel');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const throwError = require('../utils/throwError');
const generateTokens = require('../utils/generateToken');

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

  if (user) {
    const { accessToken, refreshToken } = await generateTokens(user);

    res
      .cookie('accessToken', accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 15 * 60 * 1000,
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
      })
      .cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 7 * 24 * 60 * 60 * 1000,
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
      })
      .status(201)
      .json({
        message: 'Daftar akun berhasil',
        role: user.role
      });
  } else {
    throwError('User data tidak valid!', 400);
  }
});

const loginUser = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });
  if (!user) throwError('Email tidak ditemukan', 401);

  const isValid = await bcrypt.compare(password, user.password);
  if (!isValid) throwError('Password invalid', 401);

  const { accessToken, refreshToken } = await generateTokens(user);

  res
    .cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: true,
      maxAge: 30 * 60 * 1000
    })
    .cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: true,
      maxAge: 168 * 60 * 60 * 1000
    })
    .json({ message: 'Login berhasil', role: user.role });
});

const getCurrentUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id).select('-password');
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

  if (!(await isPasswordMatch(currentPassword, user.password)))
    return throwError('Password tidak sesuai', 400, 'password');

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

const logoutUser = asyncHandler(async (req, res) => {
  const token = req.cookies.refreshToken;

  if (token) {
    const payload = jwt.verify(token, process.env.REFRESH_TOKEN_SECRET);
    const user = await User.findById(payload.user.id);
    if (user) {
      user.refreshToken = null;
      await user.save();
    }
  }

  res
    .clearCookie('accessToken', {
      httpOnly: true,
      sameSite: 'none',
      secure: true
    })
    .clearCookie('refreshToken', {
      httpOnly: true,
      sameSite: 'none',
      secure: true
    })
    .json({ message: 'Berhasil logout' });
});

const refreshToken = asyncHandler(async (req, res) => {
  const token = req.cookies.refreshToken;
  if (!token) return res.status(401).json({ message: 'No refresh token' });

  try {
    const payload = jwt.verify(token, process.env.REFRESH_TOKEN_SECRET);

    const user = await User.findById(payload.user.id);
    if (!user || user.refreshToken !== token) {
      return res.status(403).json({ message: 'Refresh token invalid' });
    }

    const newAccessToken = jwt.sign(
      { user: { id: user._id, role: user.role } },
      process.env.ACCESS_TOKEN_SECRET,
      { expiresIn: '30m' }
    );

    res.cookie('accessToken', newAccessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 30 * 60 * 1000,
      sameSite: 'none'
    });

    res.json({ message: 'Access token berhasil di refresh' });
  } catch (err) {
    res.status(403).json({ message: 'Refresh token invalid' });
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
