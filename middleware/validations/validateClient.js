const Joi = require('joi');

const clientSchema = Joi.object({
  name: Joi.string().min(2).required().messages({
    'string.base': 'Nama client harus berupa teks',
    'string.min': 'Minimal berisi 2 huruf',
    'any.required': 'Nama client wajib diisi'
  }),
  address: Joi.string().required().messages({
    'any.required': 'Alamat client wajib diisi!',
    'string.empty': 'Alamat client tidak boleh kosong!'
  }),
  bank_account_number: Joi.string()
    .pattern(/^\d+$/)
    .min(8)
    .max(20)
    .required()
    .messages({
      'string.empty': 'Nomor rekening wajib diisi',
      'string.pattern.base': 'Nomor rekening harus berupa angka',
      'string.min': 'Nomor rekening minimal 8 digit angka',
      'string.max': 'Nomor rekening maksimal 20 digit angka'
    }),
  emergency_contact_number: Joi.string()
    .pattern(/^[0-9]{10,15}$/)
    .required()
    .messages({
      'any.required': 'Kontak darurat wajib diisi!',
      'string.pattern.base':
        'Kontak darurat harus terdiri dari 10 sampai 15 digit angka'
    }),
  email: Joi.string()
    .email({ tlds: { allow: false } })
    .required()
    .messages({
      'string.email': 'Email harus berupa alamat email yang valid',
      'any.required': 'Email wajib diisi'
    })
});

module.exports = clientSchema;
