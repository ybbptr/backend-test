const asyncHandler = require('express-async-handler');
const throwError = require('../utils/throwError');
const generateTokens = require('../utils/generateToken');
const passport = require('../config/passport');
const User = require('../model/userModel');

const googleCallback = asyncHandler(async (req, res, next) => {
  passport.authenticate(
    'google',
    { session: false },
    async (err, user, info) => {
      if (err) return throwError('Login Google gagal', 500);

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

      const { accessToken, refreshToken } = await generateTokens(user);

      res
        .cookie('accessToken', accessToken, {
          httpOnly: true,
          secure: true,
          maxAge: 30 * 60 * 1000
        })
        .cookie('refreshToken', refreshToken, {
          httpOnly: true,
          secure: true,
          maxAge: 168 * 60 * 60 * 1000
        })
        .json({ message: 'Login Google berhasil', role: user.role });
    }
  )(req, res, next);
});

module.exports = { googleCallback };
