const asyncHandler = require('express-async-handler');
const throwError = require('../utils/throwError');
const generateTokens = require('../utils/generateToken');
const passport = require('../config/passport');
const User = require('../model/userModel');

const googleCallback = asyncHandler(async (req, res, next) => {
  if (req.query.error === 'access_denied')
    return res.redirect(`${process.env.FRONTEND_REDIRECT_URL}`);

  passport.authenticate(
    'google',
    { session: false },
    async (err, user, info) => {
      if (err) return throwError('Login Google gagal', 500);

      if (!user) {
        if (!profile || !profile.emails || !profile.emails[0]) {
          return res.status(400).json({
            message: 'Data akun Google tidak lengkap atau login dibatalkan'
          });
        }

        const email = profile.emails[0].value;
        const name = profile.displayName || 'Google User';

        user = await User.create({
          name,
          email,
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
          maxAge: 30 * 60 * 1000,
          sameSite: 'none',
          path: '/'
        })
        .cookie('refreshToken', refreshToken, {
          httpOnly: true,
          secure: true,
          maxAge: 168 * 60 * 60 * 1000,
          sameSite: 'none',
          path: '/users'
        })
        .json({ message: 'Login Google berhasil', role: user.role })
        .redirect(`${process.env.FRONTEND_REDIRECT_URL}/oauth/callback`);
    }
  )(req, res, next);
});

module.exports = { googleCallback };
