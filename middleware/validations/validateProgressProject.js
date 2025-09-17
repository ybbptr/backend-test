// validators/project.schema.js
const Joi = require('joi');
const mongoose = require('mongoose');

const objectId = Joi.string().custom((value, helpers) => {
  if (!mongoose.Types.ObjectId.isValid(value))
    return helpers.error('any.invalid');
  return value;
}, 'ObjectId validator');

const nonNeg = Joi.number().min(0);

const point = Joi.object({
  total_points: nonNeg.integer().default(0).messages({
    'number.base': 'Total titik harus berupa angka',
    'number.integer': 'Total titik harus bilangan bulat',
    'number.min': 'Total titik tidak boleh negatif'
  }),
  completed_points: nonNeg
    .integer()
    .max(Joi.ref('total_points'))
    .default(0)
    .messages({
      'number.base': 'Titik selesai harus berupa angka',
      'number.integer': 'Titik selesai harus bilangan bulat',
      'number.min': 'Titik selesai tidak boleh negatif',
      'number.max': 'Titik selesai tidak boleh melebihi total titik'
    }),
  max_depth: nonNeg.default(0).messages({
    'number.base': 'Kedalaman harus berupa angka',
    'number.min': 'Kedalaman tidak boleh negatif'
  })
}).default();

const projectSchema = Joi.object({
  project_name: Joi.string().required().messages({
    'string.base': 'Nama proyek harus berupa teks',
    'string.empty': 'Nama proyek tidak boleh kosong',
    'any.required': 'Nama proyek wajib diisi'
  }),
  location: Joi.string().required().messages({
    'string.base': 'Lokasi harus berupa teks',
    'string.empty': 'Lokasi tidak boleh kosong',
    'any.required': 'Lokasi wajib diisi'
  }),
  client: objectId.required().messages({
    'any.invalid': 'ID client tidak valid',
    'any.required': 'Client wajib dipilih'
  }),
  start_date: Joi.date().required().messages({
    'date.base': 'Tanggal mulai tidak valid',
    'any.required': 'Tanggal mulai wajib diisi'
  }),
  end_date: Joi.date().allow(null).min(Joi.ref('start_date')).messages({
    'date.base': 'Tanggal selesai tidak valid',
    'date.min': 'Tanggal selesai tidak boleh sebelum tanggal mulai'
  }),
  progress: Joi.object({
    sondir: point,
    bor: point,
    cptu: point
  }).default(),
  project_value: nonNeg.default(0).required().messages({
    'number.base': 'Nilai proyek harus berupa angka',
    'number.min': 'Nilai proyek tidak boleh negatif',
    'any.required': 'Nilai proyek harus diisi'
  }),
  max_expense: Joi.any().strip(),
  proposed: Joi.any().strip(),
  used: Joi.any().strip(),
  remaining: Joi.any().strip()
});

module.exports = projectSchema;
