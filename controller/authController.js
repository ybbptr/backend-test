const asyncHandler = require('express-async-handler');
const throwError = require('../utils/throwError');
const jwt = require('jsonwebtoken');
const passport = require('../config/passport');
const User = require('../model/userModel');

const googleCallback = asyncHandler(async (req, res, next) => {
  passport.authenticate(
    'google',
    { session: false },
    async (err, user, info) => {
      if (err) throwError('Login Google gagal', 500);

      if (!user) {
        const profile = info;
        user = await User.create({
          name: profile.displayName,
          email: profile.emails[0].value,
          phone: '0000000000',
          oauthProvider: 'google',
          oauthId: profile.id
        });
      }

      const accessToken = jwt.sign(
        {
          user: {
            email: user.email,
            name: user.name,
            id: user._id,
            role: user.role
          }
        },
        process.env.ACCESS_TOKEN_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN }
      );

      res.redirect(
        `${process.env.FRONTEND_REDIRECT_URL}?token=${accessToken}&role=${user.role}`
      );
    }
  )(req, res, next);
});

module.exports = { googleCallback };
