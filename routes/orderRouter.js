const express = require('express');
const validateToken = require('../middleware/validations/validateTokenHandler');
const validateOrder = require('../middleware/validations/validateOrder');
const createOrder = require('../controller/orderController');
const upload = require('../utils/upload');
const validate = require('../middleware/validations/validate');
const multerErrorHandler = require('../middleware/multerErrorHandler');
const Router = express.Router();

Router.post(
  '/create-order',
  validateToken,
  upload.single('attachment'),
  multerErrorHandler,
  validate(validateOrder),
  createOrder
);

module.exports = Router;
