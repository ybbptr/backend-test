const asyncHandler = require('express-async-handler');
const jwt = require('jsonwebtoken');
const throwError = require('../../utils/throwError');

const validateToken = asyncHandler(async (req, res, next) => {
  const authHeader = req.headers.authorization || req.headers.Authorization;

  if (!authHeader || !authHeader.startsWith('Bearer'))
    throwError('Token tidak ditemukan atau format tidak valid', 401);

  const token = authHeader.split(' ')[1];

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) throwError('Pengguna tidak memiliki izin akses', 401);
    req.user = decoded.user;
    next();
  });
});

module.exports = validateToken;
