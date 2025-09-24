const asyncHandler = require('express-async-handler');
const jwt = require('jsonwebtoken');
const throwError = require('../../utils/throwError');

const validateToken = asyncHandler(async (req, res, next) => {
  const bearer = req.headers.authorization;
  const token =
    req.cookies?.accessToken ||
    (bearer && bearer.startsWith('Bearer ') ? bearer.split(' ')[1] : null);

  if (!token) {
    return res.status(401).json({
      success: false,
      title: 'Unauthorized',
      message: 'Token tidak ditemukan',
      hint: {
        hasCookieHeader: Boolean(req.headers.cookie),
        hasAccessCookie: Boolean(req.cookies?.accessToken),
        hasAuthHeader: Boolean(req.headers.authorization)
      }
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    req.user = { id: decoded.sub, role: decoded.role, name: decoded.name };
    return next();
  } catch {
    return res.status(401).json({
      success: false,
      title: 'Unauthorized',
      message: 'Token tidak valid atau expired'
    });
  }
});

module.exports = validateToken;
