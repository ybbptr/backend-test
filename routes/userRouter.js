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
const Router = express.Router();

Router.post('/register', validateRegister, registerUser);
Router.post('/login', userLogin);
Router.get('/current', validateToken, getCurrentUser);
Router.put('/update', validateToken, validateUpdate, updateUser);

module.exports = Router;
