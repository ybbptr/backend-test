const express = require('express');
const {
  registerUser,
  userLogin,
  getCurrentUser
} = require('../controller/userController');
const validateToken = require('../middleware/validateTokenHandler');
const validateRegister = require('../middleware/validateUser');
const Router = express.Router();

Router.post('/register', validateRegister, registerUser);
Router.post('/login', userLogin);
Router.get('/profile', validateToken, getCurrentUser);

module.exports = Router;
