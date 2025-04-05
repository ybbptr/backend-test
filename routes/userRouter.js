const express = require('express');
const {
  registerUser,
  userLogin,
  getCurrentUser,
  updateUser
} = require('../controller/userController');
const validateToken = require('../middleware/validations/validateTokenHandler');
const validateRegister = require('../middleware/validations/validateRegister');
const validateUpdate = require('../middleware/validations/validateUpdate');
const validateLogin = require('../middleware/validations/validateLogin');
const validate = require('../middleware/validations/validate');
const Router = express.Router();

Router.post('/register', validate(validateRegister), registerUser);
Router.post('/login', validate(validateLogin), userLogin);
Router.put('/update', validateToken, validate(validateUpdate), updateUser);
Router.get('/current', validateToken, getCurrentUser);

module.exports = Router;
