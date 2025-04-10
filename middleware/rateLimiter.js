const rateLimit = require('express-rate-limit');
const throwError = require('../utils/throwError');

const createRateLimiter = ({ windowMs, max, message }) =>
  rateLimit({
    windowMs,
    max,
    keyGenerator: (req, res) => {
      return req.body?.email || req.ip;
    },
    handler: (req, res, next, options) => {
      console.log(
        `LIMIT HIT - FOR: ${req.body?.email || req.ip} - URL: ${
          req.originalUrl
        }`
      );
      return throwError(
        message || 'Too many requests, please try again later.',
        429
      );
    }
  });

module.exports = { createRateLimiter };
