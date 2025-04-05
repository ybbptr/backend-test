const Joi = require('joi');

const loginSchema = Joi.object({
  email: Joi.string()
    .email({ tlds: { allow: false } })
    .required()
    .messages({
      'string.email': 'Email harus berupa alamat email yang valid',
      'any.required': 'Email wajib diisi'
    }),

  password: Joi.string().min(8).pattern(/[0-9]/).required().messages({
    'string.pattern.base': 'Kata sandi harus mengandung minimal satu angka',
    'string.min': 'Kata sandi minimal terdiri dari 8 karakter',
    'any.required': 'Kata sandi wajib diisi'
  })
});

module.exports = loginSchema;
