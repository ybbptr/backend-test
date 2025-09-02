const Joi = require('joi');

const createShowcaseSchema = Joi.object({
  project_name: Joi.string().required().messages({
    'any.required': 'Nama proyek wajib diisi',
    'string.empty': 'Nama proyek tidak boleh kosong'
  }),
  location: Joi.string().required().messages({
    'any.required': 'Lokasi proyek wajib diisi',
    'string.empty': 'Lokasi proyek tidak boleh kosong'
  }),
  date_start: Joi.string().allow('', null),
  date_end: Joi.string().allow('', null)
});

const updateShowcaseSchema = Joi.object({
  project_name: Joi.string().optional(),
  location: Joi.string().optional(),
  date_start: Joi.string().allow('', null).optional(),
  date_end: Joi.string().allow('', null).optional()
});

module.exports = { createShowcaseSchema, updateShowcaseSchema };
