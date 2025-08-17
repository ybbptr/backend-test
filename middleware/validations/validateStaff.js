const Joi = require('joi');

const staffSchema = Joi.object({
  staff_name: Joi.string().required().messages({
    'string.base': 'Nama staff harus berupa teks',
    'string.empty': 'Nama staff tidak boleh kosong',
    'any.required': 'Nama staff wajib diisi'
  }),
  position: Joi.string().required().messages({
    'string.base': 'Jabatan harus berupa teks',
    'string.empty': 'Jabatan tidak boleh kosong',
    'any.required': 'Jabatan wajib diisi'
  }),
  imgUrl: Joi.string().uri().allow('').optional().messages({
    'string.uri': 'URL gambar tidak valid',
    'string.base': 'URL gambar harus berupa teks'
  }),
  gif: Joi.string().uri().allow('').optional().messages({
    'string.uri': 'URL GIF tidak valid',
    'string.base': 'URL GIF harus berupa teks'
  }),
  description: Joi.string().allow('').optional().messages({
    'string.base': 'Deskripsi harus berupa teks'
  })
});

module.exports = staffSchema;
