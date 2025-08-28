const asyncHandler = require('express-async-handler');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const OtpChallenge = require('../model/otpChallengeModel');
const User = require('../model/userModel');
const PendingRegistration = require('../model/pendingRegistrationModel');
const throwError = require('../utils/throwError');
const generateTokens = require('../utils/generateToken');

const { generateOtp, hashOtp, verifyOtp, CODE_LEN } = require('../utils/otp');
const { sendOtpEmail } = require('../utils/mailer');

const isProd = process.env.NODE_ENV === 'production';
const baseCookie = {
  httpOnly: true,
  secure: isProd,
  sameSite: isProd ? 'none' : 'lax'
};

const OTP_TTL_MS = Number(process.env.OTP_TTL_MINUTES || 1) * 60 * 1000; // 1 menit
const RESEND_BLOCK_MS = Number(process.env.OTP_RESEND_SECONDS || 60) * 1000; // 60 detik
const DOC_TTL_MS = Number(process.env.OTP_DOC_TTL_MINUTES || 60) * 60 * 1000; // 1 jam
const MAX_ATTEMPTS = 5;

// ---------------------------------- REGISTER OTP ----------------------------------
const requestRegisterOtp = asyncHandler(async (req, res) => {
  const { email, name, phone, password } = req.body || {};
  if (!email || !password || !name || !phone)
    throwError('Semua field harus di isi!', 400);

  const used = await User.findOne({ email });
  if (used) throwError('Email tidak tersedia!', 400, 'email');

  const existing = await PendingRegistration.findOne({ email });
  const now = Date.now();
  if (
    existing &&
    existing.resendAfter &&
    existing.resendAfter.getTime() > now
  ) {
    const wait = Math.ceil((existing.resendAfter.getTime() - now) / 1000);
    throwError(`Tunggu ${wait} detik untuk kirim ulang OTP.`, 429);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const otp = generateOtp();
  const otpHash = await hashOtp(otp);

  const upserted = await PendingRegistration.findOneAndUpdate(
    { email },
    {
      email,
      name,
      phone,
      passwordHash,
      otpHash,
      otpExpiresAt: new Date(now + OTP_TTL_MS),
      resendAfter: new Date(now + RESEND_BLOCK_MS),
      attempts: 0,
      expiresAt: new Date(now + DOC_TTL_MS)
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const to = String(email).trim().toLowerCase();
  const code = otp;

  res.json({
    message: 'OTP diproses',
    pendingId: upserted._id,
    resendIn: Math.floor(RESEND_BLOCK_MS / 1000),
    codeLength: CODE_LEN
  });

  setImmediate(async () => {
    try {
      console.log('[MAIL] sending to', to, 'code', code);
      const data = await sendOtpEmail(to, code, {
        action: 'Verifikasi Pendaftaran',
        brand: 'SOILAB',
        brandUrl: 'https://soilab.id',
        supportEmail: 'support@soilab.id',
        logoUrl:
          'https://backend-test-production-51c5.up.railway.app/assets/soilab-logo.png',
        primaryColor: '#0e172b'
      });
      console.log('[MAIL] sent id=', data?.id, 'to', to);
    } catch (err) {
      console.error('[MAIL] FAILED for', to, '-', err?.message || err);
    }
  });
});

const resendRegisterOtp = asyncHandler(async (req, res) => {
  const { pendingId, email } = req.body || {};
  if (!pendingId) throwError('pendingId wajib diisi', 400);

  const doc = await PendingRegistration.findById(pendingId);
  if (!doc) throwError('Sesi OTP tidak ditemukan atau kadaluarsa', 404);

  const now = Date.now();
  if (doc.resendAfter && doc.resendAfter.getTime() > now) {
    const wait = Math.ceil((doc.resendAfter.getTime() - now) / 1000);
    throwError(`Tunggu ${wait} detik untuk kirim ulang`, 429);
  }

  const otp = generateOtp();
  doc.otpHash = await hashOtp(otp);
  doc.otpExpiresAt = new Date(now + OTP_TTL_MS);
  doc.resendAfter = new Date(now + RESEND_BLOCK_MS);
  doc.resendCount = (doc.resendCount || 0) + 1;
  await doc.save();

  const to = String(email).trim().toLowerCase();
  const code = otp;

  res.json({
    message: 'OTP baru telah dikirim',
    resendInSeconds: Math.floor(RESEND_BLOCK_MS / 1000),
    codeLength: CODE_LEN
  });

  setImmediate(async () => {
    try {
      console.log('[MAIL] sending to', to, 'code', code);
      const data = await sendOtpEmail(to, code, {
        action: 'Verifikasi Pendaftaran',
        brand: 'SOILAB',
        brandUrl: 'https://soilab.id',
        supportEmail: 'support@soilab.id',
        logoUrl:
          'https://backend-test-production-51c5.up.railway.app/assets/soilab-logo.png',
        primaryColor: '#0e172b'
      });
      console.log('[MAIL] sent id=', data?.id, 'to', to);
    } catch (err) {
      console.error('[MAIL] FAILED for', to, '-', err?.message || err);
    }
  });
});

const verifyRegisterOtp = asyncHandler(async (req, res) => {
  const { pendingId, code } = req.body || {};
  if (!pendingId || !code)
    throwError('pendingId dan kode otp wajib diisi', 400);

  const doc = await PendingRegistration.findById(pendingId);
  if (!doc)
    throwError('Sesi ini telah habis. Silahkan daftar ulang atau kembali', 404);

  if (doc.otpExpiresAt.getTime() < Date.now()) {
    await PendingRegistration.findByIdAndDelete(pendingId);
    throwError('Kode OTP kadaluarsa. Silakan kirim ulang.', 400, 'otp');
  }
  if (doc.attempts >= MAX_ATTEMPTS) {
    await PendingRegistration.findByIdAndDelete(pendingId);
    throwError('Terlalu banyak percobaan. Mulai ulang proses.', 429);
  }

  const submitted = String(code).replace(/\D/g, '');
  if (submitted.length !== CODE_LEN) {
    doc.attempts += 1;
    await doc.save();
    throwError(`Kode OTP harus ${CODE_LEN} digit.`, 400, 'otp');
  }

  const isValid = await verifyOtp(submitted, doc.otpHash);
  if (!isValid) {
    doc.attempts += 1;
    await doc.save();
    const attemptsLeft = MAX_ATTEMPTS - doc.attempts;
    return res.status(400).json({
      code: 'OTP_WRONG',
      message: 'Kode OTP salah.',
      attemptsLeft
    });
  }

  const exists = await User.findOne({ email: doc.email });
  if (exists) {
    await PendingRegistration.findByIdAndDelete(pendingId);
    throwError('Email tidak tersedia!', 400, 'email');
  }

  const user = await User.create({
    name: doc.name,
    email: doc.email,
    phone: doc.phone,
    password: doc.passwordHash,
    authProvider: 'local',
    emailVerified: true
  });

  await PendingRegistration.findByIdAndDelete(pendingId);

  const { accessToken, refreshToken } = await generateTokens(user);

  res
    .clearCookie('refreshToken', { ...baseCookie, path: '/' })
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
    .status(201)
    .json({ message: 'Verifikasi berhasil & akun dibuat', role: user.role });
});
// ---------------------------------- REGISTER OTP END ----------------------------------

// --------------------------------- CHANGE EMAIL OTP START ---------------------------------
const requestEmailUpdateOtp = asyncHandler(async (req, res) => {
  const userId = req.user?._id;
  const { password, newEmail } = req.body || {};
  if (!password || !newEmail)
    throwError('Password dan email baru wajib diisi', 400);

  const user = await User.findById(userId).select('+password');
  if (!user) throwError('User tidak ditemukan', 404);

  if (user.oauthProvider && user.oauthProvider !== 'local') {
    throwError('Akun OAuth tidak dapat mengubah email.', 403);
  }

  const ok = await bcrypt.compare(password, user.password);
  if (!ok) throwError('Password salah.', 401, 'password');

  const email = String(newEmail).trim().toLowerCase();
  if (email === user.email)
    throwError(
      'Email baru tidak boleh sama dengan email saat ini.',
      400,
      'email'
    );

  const used = await User.findOne({ email });
  if (used) throwError('Email baru sudah digunakan.', 400, 'email');

  const existing = await OtpChallenge.findOne({
    user: userId,
    type: 'EMAIL_UPDATE'
  });
  const now = Date.now();
  if (existing && existing.resendAfter.getTime() > now) {
    const wait = Math.ceil((existing.resendAfter.getTime() - now) / 1000);
    throwError(`Tunggu ${wait} detik untuk kirim ulang OTP.`, 429);
  }

  const code = generateOtp();
  const otpHash = await hashOtp(code);

  const challenge = await OtpChallenge.findOneAndUpdate(
    { user: userId, type: 'EMAIL_UPDATE' },
    {
      user: userId,
      type: 'EMAIL_UPDATE',
      email,
      otpHash,
      otpExpiresAt: new Date(now + OTP_TTL_MS),
      resendAfter: new Date(now + RESEND_BLOCK_MS),
      attempts: 0,
      expiresAt: new Date(now + DOC_TTL_MS)
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  res.json({
    message: 'OTP dikirim ke email baru',
    challengeId: challenge._id,
    resendIn: Math.floor(RESEND_BLOCK_MS / 1000),
    codeLength: CODE_LEN
  });

  setImmediate(async () => {
    try {
      await sendOtpEmail(email, code, {
        action: 'Verifikasi Perubahan Email',
        brand: 'SOILAB',
        brandUrl: 'https://soilab.id',
        supportEmail: 'support@soilab.id',
        primaryColor: '#0e172b'
      });
    } catch (e) {
      console.error('[MAIL EMAIL_UPDATE FAILED]', e?.message || e);
    }
  });
});

const resendEmailUpdateOtp = asyncHandler(async (req, res) => {
  const userId = req.user?._id;
  const { challengeId } = req.body || {};
  if (!challengeId) throwError('challengeId wajib diisi', 400);

  const ch = await OtpChallenge.findById(challengeId);
  if (!ch || String(ch.user) !== String(userId) || ch.type !== 'EMAIL_UPDATE') {
    throwError('Sesi OTP tidak ditemukan atau tidak valid', 404);
  }

  const now = Date.now();
  if (ch.resendAfter.getTime() > now) {
    const wait = Math.ceil((ch.resendAfter.getTime() - now) / 1000);
    throwError(`Tunggu ${wait} detik untuk kirim ulang.`, 429);
  }

  const code = generateOtp();
  ch.otpHash = await hashOtp(code);
  ch.otpExpiresAt = new Date(now + OTP_TTL_MS);
  ch.resendAfter = new Date(now + RESEND_BLOCK_MS);
  ch.resendCount = (ch.resendCount || 0) + 1;
  await ch.save();

  res.json({
    message: 'OTP baru telah dikirim',
    resendIn: Math.floor(RESEND_BLOCK_MS / 1000)
  });

  setImmediate(async () => {
    try {
      await sendOtpEmail(ch.email, code, {
        action: 'Verifikasi Perubahan Email',
        brand: 'SOILAB',
        brandUrl: 'https://soilab.id',
        supportEmail: 'support@soilab.id',
        primaryColor: '#0e172b'
      });
    } catch (e) {
      console.error('[MAIL EMAIL_UPDATE RESEND FAILED]', e?.message || e);
    }
  });
});

const verifyEmailUpdateOtp = asyncHandler(async (req, res) => {
  const userId = req.user?._id;
  const { challengeId, code } = req.body || {};
  if (!challengeId || !code)
    throwError('challengeId dan kode otp wajib diisi', 400);

  const ch = await OtpChallenge.findById(challengeId);
  if (!ch || String(ch.user) !== String(userId) || ch.type !== 'EMAIL_UPDATE') {
    throwError('Sesi OTP tidak ditemukan atau tidak valid', 404);
  }

  if (ch.otpExpiresAt.getTime() < Date.now()) {
    await OtpChallenge.findByIdAndDelete(challengeId);
    throwError('Kode OTP kadaluarsa. Silakan kirim ulang.', 400, 'otp');
  }
  if (ch.attempts >= MAX_ATTEMPTS) {
    await OtpChallenge.findByIdAndDelete(challengeId);
    throwError('Terlalu banyak percobaan. Mulai ulang proses.', 429);
  }

  const submitted = String(code).replace(/\D/g, '');
  if (submitted.length !== CODE_LEN) {
    ch.attempts += 1;
    await ch.save();
    throwError(`Kode OTP harus ${CODE_LEN} digit.`, 400, 'otp');
  }

  const ok = await verifyOtp(submitted, ch.otpHash);
  if (!ok) {
    ch.attempts += 1;
    await ch.save();
    throwError('Kode OTP salah.', 400, 'otp');
  }

  const exists = await User.findOne({ email: ch.email });
  if (exists) {
    await OtpChallenge.findByIdAndDelete(challengeId);
    throwError('Email baru sudah digunakan.', 400, 'email');
  }

  const user = await User.findById(userId);
  user.email = ch.email;
  user.emailVerified = true;
  await user.save();

  await OtpChallenge.findByIdAndDelete(challengeId);

  const { accessToken, refreshToken } = await generateTokens(user);
  res
    .clearCookie('refreshToken', { ...baseCookie, path: '/' })
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
    .json({ message: 'Email berhasil diperbarui', email: user.email });
});
// ---------------------------------- CHANGE EMAIL OTP ----------------------------------

// const registerUser = asyncHandler(async (req, res) => {
//   const { email, name, phone, password } = req.body || {};
//   if (!email || !password || !name || !phone) {
//     throwError('Semua field harus di isi!', 400);
//   }

//   const userExist = await User.findOne({ email });
//   if (userExist) throwError('Email tidak tersedia!', 400, 'email');

//   const hashedPassword = await bcrypt.hash(password, 10);
//   const user = await User.create({
//     name,
//     email,
//     phone,
//     password: hashedPassword
//   });

//   if (!user) throwError('User data tidak valid!', 400);

//   const { accessToken, refreshToken } = await generateTokens(user);

//   res.clearCookie('refreshToken', { ...baseCookie, path: '/' });

//   res
//     .cookie('accessToken', accessToken, {
//       ...baseCookie,
//       path: '/', // global
//       maxAge: 30 * 60 * 1000 // 30 menit
//     })
//     .cookie('refreshToken', refreshToken, {
//       ...baseCookie,
//       path: '/users', // prefix untuk /users/refresh-token
//       maxAge: 7 * 24 * 60 * 60 * 1000 // 7 hari
//     })
//     .status(201)
//     .json({ message: 'Daftar akun berhasil', role: user.role });
// });

const loginUser = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email }).select('+password');
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
  const user = await User.findById(req.user.id);
  if (!user) return throwError('User tidak ditemukan!', 404);
  res.status(200).json(user);
});

const updateUser = asyncHandler(async (req, res) => {
  const me = await User.findById(req.user.id).select('-role');
  if (!me) throwError('User data tidak valid!', 400);

  const { name, phone } = req.body || {};
  if (!name && !phone) {
    return throwError('Isi setidaknya salah satu field!', 400);
  }

  const updatedFields = {};
  if (name) updatedFields.name = name;
  if (phone) updatedFields.phone = phone;

  const updatedUser = await User.findByIdAndUpdate(me.id, updatedFields, {
    new: true,
    runValidators: true
  }).select('-role');

  res.status(200).json({ message: 'Berhasil di update!', user: updatedUser });
});

const getAllUsers = asyncHandler(async (req, res) => {
  const me = await User.findById(req.user.id).select('role');
  if (!me || me.role !== 'admin') {
    return throwError('Anda tidak memiliki izin untuk mengakses data!', 403);
  }
  const users = await User.find({ role: 'user' }).select('-role');
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
      } catch (_) {}
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
      path: '/',
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

const deleteTestAccount = asyncHandler(async (req, res) => {
  const user = await User.findOneAndDelete({ email: 'delivered@resend.dev' });
  if (!user) return throwError('Akun tester tidak ditemukan', 404);

  return res.status(200).json({ message: 'Akun testing berhasil di hapus' });
});

module.exports = {
  // registerUser,
  loginUser,
  getCurrentUser,
  updateUser,
  getAllUsers,
  updatePassword,
  logoutUser,
  refreshToken,
  requestRegisterOtp,
  resendRegisterOtp,
  verifyRegisterOtp,
  requestEmailUpdateOtp,
  resendEmailUpdateOtp,
  verifyEmailUpdateOtp,
  deleteTestAccount
};
