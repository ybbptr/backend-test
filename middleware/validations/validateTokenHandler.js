const asyncHandler = require('express-async-handler');
const jwt = require('jsonwebtoken');
const throwError = require('../../utils/throwError');

const validateToken = asyncHandler(async (req, _res, next) => {
  const bearer = req.headers.authorization;
  const token =
    req.cookies?.accessToken ||
    (bearer && bearer.startsWith('Bearer ') ? bearer.split(' ')[1] : null);

  if (!token) throwError('Token tidak ditemukan', 401);

  try {
    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    req.user = { id: decoded.sub, role: decoded.role, name: decoded.name };
    return next();
  } catch (_err) {
    throwError('Token tidak valid atau expired', 401);
  }
});

module.exports = validateToken;
