const Joi = require('joi');

const registerSchema = Joi.object({
  email: Joi.string()
    .email({ tlds: { allow: false } })
    .required()
    .messages({
      'string.email': 'Email harus berupa alamat email yang valid!',
      'any.required': 'Email wajib diisi!'
    }),

  name: Joi.string().min(3).required().messages({
    'string.min': 'Nama minimal terdiri dari 3 karakter!',
    'any.required': 'Nama wajib diisi!'
  }),

  password: Joi.string().min(8).pattern(/[0-9]/).required().messages({
    'string.pattern.base': 'Kata sandi harus mengandung minimal satu angka',
    'string.min': 'Kata sandi minimal terdiri dari 8 karakter!',
    'any.required': 'Kata sandi wajib diisi!'
  }),

  phone: Joi.string()
    .pattern(/^[0-9]{10,15}$/)
    .required()
    .messages({
      'string.pattern.base': 'Nomor telepon berupa angka 10 - 15 digit!',
      'any.required': 'Nomor telepon wajib diisi!'
    })
});

module.exports = registerSchema;
