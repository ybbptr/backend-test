const Joi = require('joi');

const showcaseSchema = Joi.object({
  project_name: Joi.string().required().messages({
    'string.base': 'Nama proyek harus berupa teks',
    'string.empty': 'Nama proyek tidak boleh kosong',
    'any.required': 'Nama proyek wajib diisi'
  }),
  location: Joi.string().required().messages({
    'string.base': 'Lokasi proyek harus berupa teks',
    'string.empty': 'Lokasi proyek tidak boleh kosong',
    'any.required': 'Lokasi proyek wajib diisi'
  }),
  imgUrl: Joi.string().uri().allow('').optional().messages({
    'string.base': 'URL gambar harus berupa teks',
    'string.uri': 'URL gambar tidak valid'
  }),
  date_start: Joi.string().allow('').optional().messages({
    'string.base': 'Tanggal mulai harus berupa teks'
  }),
  date_end: Joi.string().allow('').optional().messages({
    'string.base': 'Tanggal selesai harus berupa teks'
  })
});

module.exports = showcaseSchema;
