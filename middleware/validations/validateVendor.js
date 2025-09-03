const Joi = require('joi');

const vendorSchema = Joi.object({
  name: Joi.string().min(2).required().messages({
    'string.base': 'Nama vendor harus berupa teks',
    'string.min': 'Minimal berisi 2 huruf',
    'any.required': 'Nama vendor wajib diisi'
  }),
  npwp: Joi.string()
    .pattern(/^[0-9]{10,16}$/)
    .required()
    .messages({
      'any.required': 'Nomor NPWP wajib diisi!',
      'string.pattern.base':
        'Nomor NPWP harus terdiri dari 10 sampai 16 digit angka'
    }),
  address: Joi.string().required().messages({
    'any.required': 'Alamat vendor wajib diisi!',
    'string.empty': 'Alamat vendor tidak boleh kosong!'
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
  phone: Joi.string()
    .pattern(/^[0-9]{10,15}$/)
    .required()
    .messages({
      'any.required': 'Nomor vendor wajib diisi!',
      'string.pattern.base':
        'Nomor telepon harus terdiri dari 10 sampai 15 digit angka'
    })
});

module.exports = vendorSchema;
