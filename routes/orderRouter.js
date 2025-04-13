const express = require('express');
const validateToken = require('../middleware/validations/validateTokenHandler');
const validateOrder = require('../middleware/validations/validateOrder');
const createOrder = require('../controller/orderController');
const upload = require('../utils/upload');
const validate = require('../middleware/validations/validate');
const multerErrorHandler = require('../middleware/multerErrorHandler');
const { createRateLimiter } = require('../middleware/rateLimiter');
const Router = express.Router();

const orderLimiter = createRateLimiter({
  windowMs: 5 * 60 * 1000,
  max: 3,
  message: 'Terlalu banyak permintaan pemesanan, coba lagi nanti.'
});

Router.post(
  '/create-order',
  validateToken,
  // orderLimiter,
  upload.single('attachment'),
  multerErrorHandler,
  validate(validateOrder),
  createOrder
);

module.exports = Router;
