const asyncHandler = require('express-async-handler');
const jwt = require('jsonwebtoken');
const throwError = require('../../utils/throwError');

const validateToken = asyncHandler(async (req, res, next) => {
  const token = req.cookies.token;

  if (!token) {
    throwError('Token tidak ditemukan di cookie', 401);
  }

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) throwError('Token tidak valid', 403);
    req.user = decoded.user;
    next();
  });
});

module.exports = validateToken;
