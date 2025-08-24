const asyncHandler = require('express-async-handler');
const jwt = require('jsonwebtoken');
const throwError = require('../../utils/throwError');

const validateToken = asyncHandler(async (req, res, next) => {
  // pastikan cookie-parser sudah di app.use(cookieParser())
  const token =
    req.cookies?.accessToken ||
    (req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.split(' ')[1]
      : null);

  if (!token) throwError('Token tidak ditemukan', 401);

  try {
    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    req.user = decoded.user;
    return next();
  } catch (err) {
    throwError('Token tidak valid atau expired', 401);
  }
});

module.exports = validateToken;
