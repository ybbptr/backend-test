const Joi = require('joi');

const passwordSchema = Joi.object({
  currentPassword: Joi.string().min(8).pattern(/[0-9]/).required().messages({
    'string.pattern.base': 'Kata sandi harus mengandung minimal satu angka',
    'string.min': 'Kata sandi minimal terdiri dari 8 karakter!',
    'any.required': 'Kata sandi wajib diisi!'
  }),
  newPassword: Joi.string().min(8).pattern(/[0-9]/).required().messages({
    'string.pattern.base': 'Kata sandi harus mengandung minimal satu angka',
    'string.min': 'Kata sandi minimal terdiri dari 8 karakter!',
    'any.required': 'Kata sandi wajib diisi!'
  })
});

module.exports = passwordSchema;
