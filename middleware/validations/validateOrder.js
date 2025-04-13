const Joi = require('joi');

const orderSchema = Joi.object({
  name: Joi.string().min(2).required().messages({
    'string.min': 'Nama minimal terdiri dari 2 karakter!',
    'any.required': 'Nama wajib diisi!'
  }),
  company: Joi.string().min(3).required().messages({
    'string.min': 'Nama perusahaan minimal terdiri dari 2 karakter!',
    'any.required': 'Nama perusahaan wajib diisi!'
  }),
  email: Joi.string()
    .email({ tlds: { allow: false } })
    .required()
    .messages({
      'string.email': 'Email harus berupa alamat email yang valid',
      'any.required': 'Email wajib diisi'
    }),
  contact: Joi.string()
    .pattern(/^[0-9]{10,15}$/)
    .required()
    .messages({
      'string.pattern.base': 'Nomor telepon berupa angka 10 - 15 digit!',
      'any.required': 'Nomor telepon wajib diisi!'
    }),
  service: Joi.string().valid('SIS', 'SLS', 'topography').required().messages({
    'any.only': 'Jenis layanan tidak valid',
    'any.required': 'Jenis layanan wajib dipilih'
  }),
  message: Joi.string().min(2).required().messages({
    'string.min': 'Pesan minimal terdiri dari 2 karakter!',
    'any.required': 'Pesan wajib diisi'
  })
});

module.exports = orderSchema;
