const jwt = require('jsonwebtoken');
const throwError = require('./throwError');

const PC_TTL_SECONDS = Number(process.env.PC_TTL_SECONDS || 180); // 3 menit
const PR_TOKEN_TTL = Number(process.env.PR_TOKEN_TTL || 300); // 5 menit

const PC_ALLOWED_PURPOSES = ['EMAIL_UPDATE'];

function assertPcPurpose(purpose) {
  if (!PC_ALLOWED_PURPOSES.includes(purpose)) {
    throwError('Purpose token tidak valid', 400);
  }
}

function signPcToken({ userId, purpose }) {
  assertPcPurpose(purpose);
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
    assertPcPurpose(payload.purpose);
    if (purpose && payload.purpose !== purpose)
      throwError('Token tidak cocok untuk tujuan ini', 401);
    return payload;
  } catch {
    throwError('Konfirmasi password telah kedaluwarsa / tidak valid', 401);
  }
}

function signPasswordResetToken(userId) {
  return jwt.sign(
    { sub: String(userId), purpose: 'PASSWORD_RESET' },
    process.env.PASSWORD_RESET_SECRET,
    { expiresIn: PR_TOKEN_TTL }
  );
}

function verifyPasswordResetToken(token, expectedUserId) {
  try {
    const payload = jwt.verify(token, process.env.PASSWORD_RESET_SECRET);
    if (payload.purpose !== 'PASSWORD_RESET')
      throwError('Purpose token salah', 401);
    if (expectedUserId && String(payload.sub) !== String(expectedUserId))
      throwError('Token tidak cocok', 401);
    return payload;
  } catch {
    throwError('Token reset tidak valid / kedaluwarsa', 401);
  }
}

module.exports = {
  // pcToken (Password change)
  signPcToken,
  verifyPcToken,
  PC_TTL_SECONDS,
  // prToken (Password reset)
  signPasswordResetToken,
  verifyPasswordResetToken,
  PR_TOKEN_TTL
};
