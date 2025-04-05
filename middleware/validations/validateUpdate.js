const Joi = require('joi');

const updateSchema = Joi.object({
  email: Joi.string()
    .email({ tlds: { allow: false } })
    .messages({
      'string.email': 'Email harus berupa alamat email yang valid',
      'any.required': 'Email wajib diisi'
    }),

  name: Joi.string().min(3).messages({
    'string.min': 'Nama minimal terdiri dari 3 karakter',
    'any.required': 'Nama wajib diisi'
  }),

  phone: Joi.string()
    .pattern(/^[0-9]{10,15}$/)
    .messages({
      'string.pattern.base':
        'Nomor telepon harus terdiri dari 10 sampai 15 digit angka',
      'any.required': 'Nomor telepon wajib diisi'
    })
})
  .min(1)
  .messages({
    'object.min': 'Minimal harus ada satu data yang diubah'
  });

module.exports = updateSchema;
