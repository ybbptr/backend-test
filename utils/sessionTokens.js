const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const hash = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

function issueAccessToken(userLike, { expiresIn = '30m' } = {}) {
  const sub = String(userLike._id || userLike.sub);
  const role = userLike.role;
  const name = userLike.name;
  return jwt.sign({ sub, role, name }, process.env.ACCESS_TOKEN_SECRET, {
    expiresIn
  });
}

function issueRefreshToken(userLike, sid, remember = true, { expiresIn } = {}) {
  const sub = String(userLike._id || userLike.sub);
  const role = userLike.role;
  const name = userLike.name;
  // default 7d biar sama seperti sebelumnya
  const ttl = expiresIn || '7d';
  return jwt.sign(
    { sub, role, name, sid, remember, typ: 'refresh' },
    process.env.REFRESH_TOKEN_SECRET,
    { expiresIn: ttl }
  );
}

module.exports = { hash, issueAccessToken, issueRefreshToken };
