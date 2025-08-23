const express = require('express');
const {
  registerUser,
  userLogin,
  getCurrentUser,
  updateUser,
  getAllUsers,
  updatePassword,
  logoutUser
} = require('../controller/userController');
const validateToken = require('../middleware/validations/validateTokenHandler');
const validateRegister = require('../middleware/validations/validateRegister');
const validateUpdate = require('../middleware/validations/validateUpdate');
const validateLogin = require('../middleware/validations/validateLogin');
const validateNewPassword = require('../middleware/validations/validateNewPassword');
const { createRateLimiter } = require('../middleware/rateLimiter');
const validate = require('../middleware/validations/validate');
const Router = express.Router();

const loginLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 menit
  max: 5,
  message: 'Terlalu banyak percobaan login, coba lagi nanti.'
});

const registerLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 jam
  max: 3,
  message: 'Pendaftaran terlalu sering, coba lagi dalam 1 jam.'
});

// POST Method
Router.post(
  '/register',
  // registerLimiter,
  validate(validateRegister),
  registerUser
);
Router.post('/login', validate(validateLogin), userLogin);
// Router.post('/login', loginLimiter, validate(validateLogin), userLogin);
Router.post('/logout', logoutUser);

// PUT method
Router.put(
  '/update-profile',
  validateToken,
  validate(validateUpdate),
  updateUser
);

Router.put(
  '/change-password',
  validate(validateNewPassword),
  validateToken,
  updatePassword
);

// GET method
Router.get('/current', validateToken, getCurrentUser);
Router.get('/allUsers', validateToken, getAllUsers);

module.exports = Router;
