const Joi = require('joi');

/* CREATE schema */
const createStaffSchema = Joi.object({
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
  imgUrl: Joi.string().uri().allow('', null).messages({
    'string.uri': 'URL gambar tidak valid',
    'string.base': 'URL gambar harus berupa teks'
  }),
  gif: Joi.string().uri().allow('', null).messages({
    'string.uri': 'URL GIF tidak valid',
    'string.base': 'URL GIF harus berupa teks'
  }),
  description: Joi.string().allow('', null).messages({
    'string.base': 'Deskripsi harus berupa teks'
  })
});

/* UPDATE schema */
const updateStaffSchema = Joi.object({
  staff_name: Joi.string().optional().messages({
    'string.base': 'Nama staff harus berupa teks',
    'string.empty': 'Nama staff tidak boleh kosong'
  }),
  position: Joi.string().optional().messages({
    'string.base': 'Jabatan harus berupa teks',
    'string.empty': 'Jabatan tidak boleh kosong'
  }),
  imgUrl: Joi.string().uri().allow('', null).optional().messages({
    'string.uri': 'URL gambar tidak valid',
    'string.base': 'URL gambar harus berupa teks'
  }),
  gif: Joi.string().uri().allow('', null).optional().messages({
    'string.uri': 'URL GIF tidak valid',
    'string.base': 'URL GIF harus berupa teks'
  }),
  description: Joi.string().allow('', null).optional().messages({
    'string.base': 'Deskripsi harus berupa teks'
  })
});

module.exports = {
  createStaffSchema,
  updateStaffSchema
};
