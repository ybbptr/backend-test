const Joi = require('joi');

const employeeValidation = Joi.object({
  user: Joi.string().email().required().messages({
    'string.base': 'Email harus berupa teks',
    'string.email': 'Email tidak valid',

    'any.required': 'Email wajib diisi'
  }),
  name: Joi.string().min(2).required().messages({
    'string.base': 'Nama harus berupa teks',
    'string.min': 'Minimal berisi 2 huruf',
    'any.required': 'Nama wajib diisi'
  }),
  nik: Joi.string()
    .required()
    .pattern(/^[0-9]+$/)
    .length(16)
    .messages({
      'any.required': 'NIK wajib diisi',
      'string.pattern.base': 'NIK hanya boleh berisi angka',
      'string.length': 'NIK harus 16 digit'
    }),
  age: Joi.number().integer().positive().min(1).required().messages({
    'number.base': 'Umur harus berupa angka',
    'number.min': 'Umur minimal 1 tahun',
    'number.positive': 'Umur harus lebih dari 0',
    'number.integer': 'Umur harus bilangan bulat',
    'any.required': 'Umur wajib diisi'
  }),
  employment_type: Joi.string()
    .valid('Freelance', 'Karyawan')
    .required()
    .messages({
      'any.only': 'Tipe pekerjaan harus Freelance atau Karyawan',
      'any.required': 'Tipe pekerjaan wajib diisi'
    }),
  religion: Joi.string()
    .valid('Islam', 'Protestan', 'Katolik', 'Budha', 'Hindu', 'Konghucu')
    .allow(null, ''),
  height: Joi.number().positive().allow(null).required().messages({
    'any.required': 'Tinggi badan wajib diisi'
  }),
  weight: Joi.number().positive().allow(null).required().messages({
    'any.required': 'Berat badan wajib diisi'
  }),
  number_of_children: Joi.number().integer().min(0).allow(null),
  place_of_birth: Joi.string().allow(null, ''),
  date_of_birth: Joi.date().allow(null),
  status: Joi.string().valid('Menikah', 'Belum Menikah').allow(null, ''),
  bank_account_number: Joi.string().allow(null, ''),
  emergency_contact_number: Joi.string()
    .pattern(/^[0-9]{10,15}$/)
    .messages({
      'string.pattern.base':
        'Nomor telepon harus terdiri dari 10 sampai 15 digit angka'
    }),
  position: Joi.string().valid('Admin', 'Karyawan').required().messages({
    'any.only': 'Posisi harus Admin atau Karyawan',
    'any.required': 'Posisi wajib diisi'
  }),
  blood_type: Joi.string().valid('A', 'B', 'AB', 'O').allow(null, ''),
  start_date: Joi.date().allow(null),
  end_date: Joi.date().allow(null),
  documents: Joi.object({
    ktp: Joi.string().allow(null, ''),
    asuransi: Joi.string().allow(null, ''),
    mcu: Joi.string().allow(null, ''),
    keterangan_sehat: Joi.string().allow(null, ''),
    kelakuan_baik: Joi.string().allow(null, ''),
    vaksinasi: Joi.string().allow(null, '')
  }).allow(null)
});

module.exports = employeeValidation;
