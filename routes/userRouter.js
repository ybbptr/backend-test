const express = require('express');
const {
  registerUser,
  userLogin,
  getCurrentUser,
  updateUser,
  getAllUsers,
  updatePassword
} = require('../controller/userController');
const validateToken = require('../middleware/validations/validateTokenHandler');
const validateRegister = require('../middleware/validations/validateRegister');
const validateUpdate = require('../middleware/validations/validateUpdate');
const validateLogin = require('../middleware/validations/validateLogin');
const validateNewPassword = require('../middleware/validations/validateNewPassword');
const validate = require('../middleware/validations/validate');
const Router = express.Router();

// POST Method
Router.post('/register', validate(validateRegister), registerUser);
Router.post('/login', validate(validateLogin), userLogin);

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
