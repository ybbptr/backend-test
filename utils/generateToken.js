const jwt = require('jsonwebtoken');
const User = require('../model/userModel');

const generateTokens = async (user, { remember = false } = {}) => {
  const sub = user._id.toString();

  const accessToken = jwt.sign(
    { sub, role: user.role },
    process.env.ACCESS_TOKEN_SECRET,
    { expiresIn: '30m' }
  );

  const refreshToken = jwt.sign(
    { sub, role: user.role, remember: !!remember },
    process.env.REFRESH_TOKEN_SECRET,
    { expiresIn: '7d' }
  );

  await User.findByIdAndUpdate(sub, { refreshToken });
  return { accessToken, refreshToken };
};

module.exports = generateTokens;
