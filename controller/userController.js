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

  const hashedPassword = await bcrypt.hash(password, 10);

  const user = await User.create({
    name,
    email,
    phone,
    password: hashedPassword
  });

  if (user) {
    const accessToken = jwt.sign(
      {
        user: {
          id: user._id,
          email: user.email,
          role: user.role
        }
      },
      process.env.ACCESS_TOKEN_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    res
      .cookie('token', accessToken, {
        httpOnly: true,
        secure: true,
        maxAge: 24 * 60 * 60 * 1000
      })
      .redirect(`${process.env.FRONTEND_REDIRECT_URL}/beranda`);
  } else {
    throwError('User data tidak valid!', 400);
  }
});

const userLogin = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) throwError('Semua field harus di isi!', 400);

  const user = await User.findOne({ email });
  if (!user) throwError('Email tidak ditemukan!', 404, 'email');

  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) throwError('Password invalid!', 401, 'password');

  const userRole = user.role;

  const accessToken = jwt.sign(
    { user: { id: user._id, email: user.email, role: userRole } },
    process.env.ACCESS_TOKEN_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN }
  );

  let redirectUrl;
  if (userRole === 'admin')
    redirectUrl = `${process.env.FRONTEND_REDIRECT_URL}/dasbor-admin`;
  else if (userRole === 'karyawan')
    redirectUrl = `${process.env.FRONTEND_REDIRECT_URL}/dasbor-karyawan`;
  else redirectUrl = `${process.env.FRONTEND_REDIRECT_URL}/beranda`;

  res
    .cookie('token', accessToken, {
      httpOnly: true,
      secure: true,
      maxAge: 24 * 60 * 60 * 1000
    })
    .redirect(redirectUrl);
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

const logoutUser = (req, res) => {
  res.clearCookie('token').status(200).json({ message: 'Logout berhasil' });
};

module.exports = {
  registerUser,
  userLogin,
  getCurrentUser,
  updateUser,
  getAllUsers,
  updatePassword,
  logoutUser
};
