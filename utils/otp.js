const crypto = require('crypto');
const bcrypt = require('bcrypt');

const CODE_LEN = Number(process.env.OTP_CODE_LENGTH || 6);

function generateOtp(len = CODE_LEN) {
  let code = '';
  for (let i = 0; i < len; i++) {
    code += crypto.randomInt(0, 10).toString();
  }
  return code;
}

async function hashOtp(otp) {
  return bcrypt.hash(otp, 10);
}
async function verifyOtp(otp, hash) {
  return bcrypt.compare(otp, hash);
}

module.exports = { generateOtp, hashOtp, verifyOtp, CODE_LEN };
