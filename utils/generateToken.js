const jwt = require('jsonwebtoken');

const generateTokens = async (user) => {
  const accessToken = jwt.sign(
    { user: { id: user._id, role: user.role } },
    process.env.ACCESS_TOKEN_SECRET,
    { expiresIn: '30m' }
  );

  const refreshToken = jwt.sign(
    { user: { id: user._id, role: user.role } },
    process.env.REFRESH_TOKEN_SECRET,
    { expiresIn: '7d' }
  );

  user.refreshToken = refreshToken;
  await user.save();

  return { accessToken, refreshToken };
};

module.exports = generateTokens;
