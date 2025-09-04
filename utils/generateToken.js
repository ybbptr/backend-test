const jwt = require('jsonwebtoken');
const User = require('../model/userModel');

const generateTokens = async (user) => {
  const sub = user._id.toString();

  const accessToken = jwt.sign(
    { sub, role: user.role },
    process.env.ACCESS_TOKEN_SECRET,
    { expiresIn: '1m' }
  );

  const refreshToken = jwt.sign(
    { sub, role: user.role },
    process.env.REFRESH_TOKEN_SECRET,
    { expiresIn: '7d' }
  );

  await User.findByIdAndUpdate(sub, { refreshToken });

  return { accessToken, refreshToken };
};

module.exports = generateTokens;
