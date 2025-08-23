const express = require('express');
const router = express.Router();
const validateToken = require('../middleware/validations/validateTokenHandler');
const passport = require('../config/passport');

const { googleCallback } = require('../controller/authController');

router.get(
  '/google',
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    session: false
  })
);

router.get('/google/callback', googleCallback);

module.exports = router;
