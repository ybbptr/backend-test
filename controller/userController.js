const asyncHandler = require('express-async-handler');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
// const { Types } = require('mongoose');

const OtpChallenge = require('../model/otpChallengeModel');
const User = require('../model/userModel');
const PendingRegistration = require('../model/pendingRegistrationModel');
const throwError = require('../utils/throwError');
const generateTokens = require('../utils/generateToken');

const { generateOtp, hashOtp, verifyOtp, CODE_LEN } = require('../utils/otp');
const { sendOtpEmail } = require('../utils/mailer');
const {
  signPcToken,
  verifyPcToken,
  signPasswordResetToken,
  verifyPasswordResetToken,
  PC_TTL_SECONDS,
  PR_TOKEN_TTL
} = require('../utils/authTokens');

const parseRemember = (req) => {
  const b = req.body || {};
  const q = req.query || {};
  // dukung alias & querystring juga
  const raw =
    b.remember ??
    b.rememberMe ??
    b.remember_me ??
    q.remember ??
    q.rememberMe ??
    q.remember_me;

  if (raw === undefined || raw === null) return false;
  if (typeof raw === 'boolean') return raw;
  if (typeof raw === 'number') return raw === 1;

  const s = String(raw).trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'on' || s === 'yes' || s === 'y';
};

const isProd = process.env.NODE_ENV === 'production';

const sameSite = process.env.COOKIE_SAMESITE || 'none';
const secure =
  process.env.COOKIE_SECURE?.toLowerCase() === 'true'
    ? true
    : process.env.COOKIE_SECURE?.toLowerCase() === 'false'
    ? false
    : isProd; // default ikut production

const baseCookie = {
  httpOnly: true,
  secure, // true = https only
  sameSite, // none kalau cross-site
  path: '/' // global scope
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
    .cookie('accessToken', accessToken, {
      ...baseCookie,
      maxAge: 30 * 60 * 1000
    })
    .cookie('refreshToken', refreshToken, {
      ...baseCookie,
      maxAge: 7 * 24 * 60 * 60 * 1000
    })
    .status(201)
    .json({ message: 'Verifikasi berhasil & akun dibuat', role: user.role });
});
// ---------------------------------- REGISTER OTP END ----------------------------------

// POST /users/security/confirm-password
// body: { password, purpose }   // purpose : 'EMAIL_UPDATE' | 'PASSWORD_CHANGE' | 'FORGOT_PASSWORD'
const confirmPassword = asyncHandler(async (req, res) => {
  const userId = req.user?.id;
  const { password, purpose } = req.body || {};
  if (!password || !purpose)
    throwError('Password dan purpose wajib diisi', 400);

  const user = await User.findById(userId).select('+password oauthProvider');
  if (!user) throwError('User tidak ditemukan', 404);
  if (user.oauthProvider && user.oauthProvider !== 'local') {
    throwError('Akun OAuth tidak dapat konfirmasi password.', 403);
  }
  const ok = await bcrypt.compare(password, user.password);
  if (!ok) throwError('Password salah.', 401, 'password');

  const pcToken = signPcToken({ userId, purpose });
  res.json({ pcToken, expiresIn: PC_TTL_SECONDS });
});

// --------------------------------- CHANGE EMAIL OTP START ---------------------------------
const requestEmailUpdateOtp = asyncHandler(async (req, res) => {
  const userId = req.user?.id;
  const { pcToken, newEmail } = req.body || {};
  if (!pcToken || !newEmail)
    throwError('Konfirmasi password & email baru wajib diisi', 400);

  verifyPcToken(pcToken, { userId, purpose: 'EMAIL_UPDATE' });

  const user = await User.findById(userId).select('email oauthProvider');
  if (!user) throwError('User tidak ditemukan', 404);
  if (user.oauthProvider && user.oauthProvider !== 'local') {
    throwError('Akun OAuth tidak dapat mengubah email.', 403);
  }

  const email = String(newEmail).trim().toLowerCase();
  if (email === user.email)
    throwError('Email baru tidak boleh sama.', 400, 'email');

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
      otpExpiresAt: new Date(now + OTP_TTL_MS), // TTL 15 menit sesuai set kamu
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
  const userId = req.user?.id;
  const { challengeId } = req.body || {};
  if (!challengeId) throwError('challengeId wajib diisi', 400);

  const ch = await OtpChallenge.findById(challengeId);
  if (!ch || String(ch.user) !== String(userId) || ch.type !== 'EMAIL_UPDATE') {
    throwError('Sesi ini telah habis. Silahkan daftar ulang atau kembali', 404);
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
  const userId = req.user?.id;
  const { challengeId, code } = req.body || {};
  if (!challengeId || !code)
    throwError('challengeId dan kode otp wajib diisi', 400);

  const ch = await OtpChallenge.findById(challengeId);
  if (!ch || String(ch.user) !== String(userId) || ch.type !== 'EMAIL_UPDATE') {
    throwError('Sesi ini telah habis. Silahkan daftar ulang atau kembali', 404);
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
    .cookie('accessToken', accessToken, {
      ...baseCookie,
      maxAge: 30 * 60 * 1000
    })
    .cookie('refreshToken', refreshToken, {
      ...baseCookie,
      maxAge: 7 * 24 * 60 * 60 * 1000
    })
    .json({ message: 'Email berhasil diperbarui', email: user.email });
});
// ---------------------------------- CHANGE EMAIL OTP END----------------------------------

// ---------------------------------- PASSWORD RESET OTP START----------------------------------
// POST /users/forgot-password/request-otp
// body (logged-out): { email }
// body (logged-in):  {}  ambil req.user.id untuk ambil email
const requestPasswordResetOtp = asyncHandler(async (req, res) => {
  const emailRaw = req.body?.email;
  if (!emailRaw) throwError('Email wajib diisi', 400);
  const email = String(emailRaw).trim().toLowerCase();

  const user = await User.findOne({ email }).select('email _id');

  if (!user) {
    return res.json({
      message:
        'Jika email terdaftar, kami telah mengirim kode OTP ke email tersebut.',
      sent: true
    });
  }

  const existing = await OtpChallenge.findOne({
    user: user._id,
    type: 'PASSWORD_RESET'
  });
  const now = Date.now();
  if (
    existing &&
    existing.resendAfter &&
    existing.resendAfter.getTime() > now
  ) {
    const wait = Math.ceil((existing.resendAfter.getTime() - now) / 1000);
    throwError(`Tunggu ${wait} detik untuk kirim ulang OTP.`, 429);
  }

  const code = generateOtp();
  const otpHash = await hashOtp(code);

  const challenge = await OtpChallenge.findOneAndUpdate(
    { user: user._id, type: 'PASSWORD_RESET' },
    {
      user: user._id,
      type: 'PASSWORD_RESET',
      email: user.email,
      otpHash,
      otpExpiresAt: new Date(now + OTP_TTL_MS),
      resendAfter: new Date(now + RESEND_BLOCK_MS),
      attempts: 0,
      expiresAt: new Date(now + DOC_TTL_MS)
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  res.json({
    message:
      'Jika email terdaftar, kami telah mengirim kode OTP ke email tersebut.',
    sent: true,
    challengeId: challenge._id,
    resendIn: Math.floor(RESEND_BLOCK_MS / 1000),
    codeLength: CODE_LEN,
    ttlMinutes: Math.floor(OTP_TTL_MS / 60000)
  });

  setImmediate(async () => {
    try {
      await sendOtpEmail(user.email, code, {
        action: 'Reset Password',
        brand: 'SOILAB',
        brandUrl: 'https://soilab.id',
        supportEmail: 'support@soilab.id',
        primaryColor: '#0e172b'
      });
    } catch (e) {
      console.error('[MAIL PASSWORD_RESET FAILED]', e?.message || e);
    }
  });
});

// POST /users/forgot-password/resend-otp
// body: { challengeId }
const resendPasswordResetOtp = asyncHandler(async (req, res) => {
  const { challengeId } = req.body || {};
  if (!challengeId) throwError('challengeId wajib diisi', 400);

  const ch = await OtpChallenge.findById(challengeId);
  if (!ch || ch.type !== 'PASSWORD_RESET')
    throwError('Sesi ini telah habis. Silahkan ulangi kembali', 404);

  const now = Date.now();
  if (ch.resendAfter && ch.resendAfter.getTime() > now) {
    const wait = Math.ceil((ch.resendAfter.getTime() - now) / 1000);
    throwError(`Tunggu ${wait} detik untuk kirim ulang OTP.`, 429);
  }

  const code = generateOtp();
  ch.otpHash = await hashOtp(code);
  ch.otpExpiresAt = new Date(now + OTP_TTL_MS);
  ch.resendAfter = new Date(now + RESEND_BLOCK_MS);
  ch.resendCount = (ch.resendCount || 0) + 1;
  await ch.save();

  res.json({
    message: 'OTP baru dikirim',
    resendIn: Math.floor(RESEND_BLOCK_MS / 1000)
  });

  setImmediate(async () => {
    try {
      await sendOtpEmail(ch.email, code, {
        action: 'Reset Password',
        brand: 'SOILAB',
        brandUrl: 'https://soilab.id',
        supportEmail: 'support@soilab.id',
        primaryColor: '#0e172b'
      });
    } catch (e) {
      console.error('[MAIL PASSWORD_RESET RESEND FAILED]', e?.message || e);
    }
  });
});

// POST /users/forgot-password/verify-otp
// body: { challengeId, code }
const verifyPasswordResetOtp = asyncHandler(async (req, res) => {
  const { challengeId, code } = req.body || {};
  if (!challengeId || !code) throwError('challengeId dan otp wajib diisi', 400);

  const ch = await OtpChallenge.findById(challengeId);
  if (!ch || ch.type !== 'PASSWORD_RESET')
    throwError('Sesi ini telah habis. Silahkan ulangi kembali', 404);

  if (ch.otpExpiresAt.getTime() < Date.now()) {
    await OtpChallenge.findByIdAndDelete(challengeId);
    throwError('Kode OTP kadaluarsa. Silakan minta yang baru.', 400, 'otp');
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

  const prToken = signPasswordResetToken(ch.user);
  res.json({ prToken, expiresIn: PR_TOKEN_TTL || 300 }); // 5 menit
});

// POST /users/forgot-password/reset
// body: { prToken, newPassword }
const resetPasswordWithToken = asyncHandler(async (req, res) => {
  const { prToken, newPassword } = req.body || {};
  if (!prToken || !newPassword)
    throwError('Token reset & password baru wajib diisi', 400);

  let payload;
  try {
    payload = verifyPasswordResetToken(prToken);
  } catch {
    throwError('Token reset tidak valid / kedaluwarsa', 401);
  }

  const user = await User.findById(payload.sub).select('+password');
  if (!user) throwError('User tidak ditemukan', 404);

  if (user.oauthProvider && user.oauthProvider !== 'local') {
    throwError('Akun OAuth tidak dapat reset password lokal.', 403);
  }

  const hash = await bcrypt.hash(newPassword, 10);
  user.password = hash;
  await user.save();

  await OtpChallenge.findOneAndDelete({
    user: user._id,
    type: 'PASSWORD_RESET'
  });

  const { accessToken, refreshToken } = await generateTokens(user);

  res
    .cookie('accessToken', accessToken, {
      ...baseCookie,
      maxAge: 30 * 60 * 1000
    })
    .cookie('refreshToken', refreshToken, {
      ...baseCookie,
      maxAge: 7 * 24 * 60 * 60 * 1000
    })
    .json({ message: 'Password berhasil diperbarui' });
});

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

//   res.clearCookie('refreshToken', { ...baseCookie});

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
  const remember = parseRemember(req);
  console.log('[LOGIN][payload]', {
    bodyKeys: Object.keys(req.body || {}),
    queryKeys: Object.keys(req.query || {}),
    rememberRaw:
      req.body?.remember ??
      req.body?.rememberMe ??
      req.body?.remember_me ??
      req.query?.remember ??
      req.query?.rememberMe ??
      req.query?.remember_me,
    rememberParsed: remember
  });

  const user = await User.findOne({ email }).select('+password');
  if (!user) throwError('Email tidak ditemukan', 401);
  const isValid = await bcrypt.compare(password, user.password);
  if (!isValid) throwError('Password invalid', 401);

  const { accessToken, refreshToken } = await generateTokens(user, {
    remember
  });

  const refreshCookieOpts = remember
    ? { ...baseCookie, maxAge: 7 * 24 * 60 * 60 * 1000 } // persistent 7d
    : { ...baseCookie }; // session cookie (tanpa maxAge)

  console.log('[LOGIN] issuing cookies', {
    remember,
    accessMaxAgeMs: 30 * 60 * 1000,
    refreshPersistent: !!refreshCookieOpts.maxAge,
    baseCookie: {
      sameSite: baseCookie.sameSite,
      secure: baseCookie.secure,
      path: baseCookie.path
    }
  });

  res.cookie('accessToken', accessToken, {
    ...baseCookie,
    maxAge: 30 * 60 * 1000
  });
  res.cookie('refreshToken', refreshToken, refreshCookieOpts);
  return res.json({
    message: 'Login berhasil',
    role: user.role,
    accessExpiresInSec: 1800
  });

  // res.clearCookie('refreshToken', { ...baseCookie });
  // res.clearCookie('accessToken', { ...baseCookie });
  // res
  //   .cookie('accessToken', accessToken, {
  //     ...baseCookie,
  //     maxAge: 30 * 60 * 1000
  //   })
  //   .cookie('refreshToken', refreshToken, refreshCookieOpts)
  //   .json({
  //     message: 'Login berhasil',
  //     role: user.role,
  //     accessExpiresInSec: 1800
  //   });
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
        await User.findByIdAndUpdate(payload.sub, {
          refreshToken: null,
          prevRefreshToken: null
        });
      } catch (_) {}
    }

    res
      .clearCookie('accessToken', { ...baseCookie })
      .clearCookie('refreshToken', { ...baseCookie })
      .json({ message: 'Berhasil logout' });
  } catch (_) {
    res
      .clearCookie('accessToken', { ...baseCookie })
      .clearCookie('refreshToken', { ...baseCookie })
      .status(200)
      .json({ message: 'Berhasil logout' });
  }
});

const refreshToken = asyncHandler(async (req, res) => {
  // ---- DEBUG: incoming ----
  const hasCookieHeader = !!req.headers.cookie;
  const token = req.cookies?.refreshToken;
  console.log('[rt][in]', {
    url: req.originalUrl,
    hasCookieHeader,
    hasRefreshCookie: !!token,
    cookieKeys: Object.keys(req.cookies || {}),
    env: {
      NODE_ENV: process.env.NODE_ENV,
      COOKIE_SAMESITE: process.env.COOKIE_SAMESITE,
      COOKIE_SECURE: process.env.COOKIE_SECURE
    }
  });

  if (!token) {
    console.log('[rt] missing refresh cookie');
    return res.status(401).json({ message: 'No refresh token' });
  }

  try {
    const payload = jwt.verify(token, process.env.REFRESH_TOKEN_SECRET);
    console.log('[rt] jwt ok', {
      sub: payload?.sub,
      remember: !!payload?.remember
    });

    const user = await User.findById(payload.sub).select(
      '+refreshToken +prevRefreshToken role name'
    );

    if (!user) {
      console.log('[rt] user not found', { sub: payload?.sub });
      return res
        .clearCookie('accessToken', { ...baseCookie })
        .clearCookie('refreshToken', { ...baseCookie })
        .status(401)
        .json({ message: 'Refresh token invalid' });
    }

    const matchCurrent = user.refreshToken === token;
    const matchPrev = user.prevRefreshToken === token;

    console.log('[rt] db match', {
      matchCurrent,
      matchPrev,
      dbCurrent: user.refreshToken ? '<present>' : '<null>',
      dbPrev: user.prevRefreshToken ? '<present>' : '<null>',
      providedLen: token.length
    });

    if (!matchCurrent && !matchPrev) {
      console.log('[rt] token not found in DB (invalid)');
      return res
        .clearCookie('accessToken', { ...baseCookie })
        .clearCookie('refreshToken', { ...baseCookie })
        .status(401)
        .json({ message: 'Refresh token invalid' });
    }

    const remember = !!payload.remember;

    const newAccessToken = jwt.sign(
      { sub: user._id.toString(), role: user.role, name: user.name },
      process.env.ACCESS_TOKEN_SECRET,
      { expiresIn: '30m' }
    );

    const newRefreshToken = jwt.sign(
      { sub: user._id.toString(), role: user.role, name: user.name, remember },
      process.env.REFRESH_TOKEN_SECRET,
      { expiresIn: '7d' }
    );

    await User.findByIdAndUpdate(user._id, {
      prevRefreshToken: user.refreshToken,
      refreshToken: newRefreshToken
    });

    const refreshCookieOpts = remember
      ? { ...baseCookie, maxAge: 7 * 24 * 60 * 60 * 1000 } // persistent
      : { ...baseCookie }; // session

    // ---- DEBUG: outgoing (sebelum kirim) ----
    console.log('[rt][out]', {
      setAccessCookie: true,
      setRefreshCookie: true,
      accessTTLmin: 30,
      refreshTTL: remember ? '7d (persistent)' : 'session',
      cookieCfg: {
        sameSite: baseCookie.sameSite,
        secure: baseCookie.secure,
        path: baseCookie.path
      }
    });

    return res
      .cookie('accessToken', newAccessToken, {
        ...baseCookie,
        maxAge: 30 * 60 * 1000
      })
      .cookie('refreshToken', newRefreshToken, refreshCookieOpts)
      .json({ message: 'Access token berhasil di refresh' });
  } catch (e) {
    console.log('[rt] verify error', e?.message || e);
    return res
      .clearCookie('accessToken', { ...baseCookie })
      .clearCookie('refreshToken', { ...baseCookie })
      .status(401)
      .json({ message: 'Refresh token invalid/expired' });
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
  updatePassword,
  logoutUser,
  refreshToken,
  requestRegisterOtp,
  resendRegisterOtp,
  verifyRegisterOtp,
  confirmPassword,
  requestEmailUpdateOtp,
  resendEmailUpdateOtp,
  verifyEmailUpdateOtp,
  requestPasswordResetOtp,
  resendPasswordResetOtp,
  verifyPasswordResetOtp,
  resetPasswordWithToken,
  deleteTestAccount
};
