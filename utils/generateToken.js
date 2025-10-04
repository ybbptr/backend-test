const { randomUUID } = require('crypto');
const Session = require('../model/sessionModel');
const {
  hash,
  issueAccessToken,
  issueRefreshToken
} = require('./sessionTokens');

const generateTokens = async (
  user,
  { remember = false, ua = '', ip = '' } = {}
) => {
  const sid = randomUUID();

  const refreshToken = issueRefreshToken(
    { _id: user._id, role: user.role, name: user.name },
    sid,
    remember
  );

  const maxAgeSec = 7 * 24 * 3600;
  await Session.create({
    userId: user._id,
    sid,
    currentRtHash: hash(refreshToken),
    prevRtHash: null,
    remember,
    ua,
    ip,
    expiresAt: new Date(Date.now() + maxAgeSec * 1000)
  });

  const accessToken = issueAccessToken({
    _id: user._id,
    role: user.role,
    name: user.name
  });

  return { accessToken, refreshToken };
};

module.exports = generateTokens;
