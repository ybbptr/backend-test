const asyncHandler = require('express-async-handler');
const jwt = require('jsonwebtoken');
const throwError = require('../../utils/throwError');

const validateToken = asyncHandler(async (req, res, next) => {
  const token = req.cookies.accessToken;

  if (!token) {
    throwError(`Token tidak ditemukan di cookie, ${token}`, 401);
  }

  try {
    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    req.user = decoded.user;
    next();
  } catch (err) {
    throwError('Token tidak valid atau expired', 401);
  }
});

module.exports = validateToken;
