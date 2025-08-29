const jwt = require('jsonwebtoken');
const throwError = require('./throwError');

const PC_TTL_SECONDS = Number(process.env.PC_TTL_SECONDS || 180); // 3 menit
const ALLOWED_PURPOSES = ['EMAIL_UPDATE', 'PASSWORD_CHANGE', 'FORGOT_PASSWORD'];

function assertPurpose(purpose) {
  if (!ALLOWED_PURPOSES.includes(purpose)) {
    throwError('Purpose token tidak valid', 400);
  }
}

function signPcToken({ userId, purpose }) {
  assertPurpose(purpose);
  return jwt.sign(
    { sub: String(userId), purpose },
    process.env.PASSWORD_CONFIRM_SECRET,
    { expiresIn: PC_TTL_SECONDS }
  );
}

function verifyPcToken(token, { userId, purpose }) {
  try {
    const payload = jwt.verify(token, process.env.PASSWORD_CONFIRM_SECRET);
    if (String(payload.sub) !== String(userId))
      throwError('Token tidak cocok', 401);
    assertPurpose(payload.purpose);
    if (purpose && payload.purpose !== purpose) {
      throwError('Token tidak cocok untuk tujuan ini', 401);
    }
    return payload;
  } catch {
    throwError('Konfirmasi password telah kedaluwarsa / tidak valid', 401);
  }
}

module.exports = {
  signPcToken,
  verifyPcToken,
  PC_TTL_SECONDS,
  ALLOWED_PURPOSES
};
