const Joi = require('joi');
const mongoose = require('mongoose');

const objectIdValidator = (value, helpers) => {
  if (!mongoose.Types.ObjectId.isValid(value)) {
    return helpers.error('any.invalid');
  }
  return value;
};

const employeeCreateValidation = Joi.object({
  user: Joi.string().required().custom(objectIdValidator).messages({
    'any.invalid': 'User harus berupa ObjectId yang valid',
    'string.empty': 'User tidak boleh kosong!',
    'any.required': 'User wajib diisi'
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

  address: Joi.string().required().messages({
    'string.base': 'Alamat harus berupa teks',
    'any.required': 'Alamat wajib diisi'
  }),

  phone: Joi.string()
    .pattern(/^[0-9]{10,15}$/)
    .required()
    .messages({
      'any.required': 'Nomor telepon wajib diisi!',
      'string.pattern.base':
        'Nomor telepon harus terdiri dari 10 sampai 15 digit angka'
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

  height: Joi.number().positive().required().messages({
    'any.required': 'Tinggi badan wajib diisi'
  }),

  weight: Joi.number().positive().required().messages({
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

  blood_type: Joi.string().valid('A', 'B', 'AB', 'O').allow(null, '').messages({
    'any.only': 'Golongan darah hanya boleh A, B, AB, atau O'
  }),

  start_date: Joi.date().allow(null).messages({
    'date.base': 'Tanggal mulai harus berupa tanggal yang valid'
  }),

  end_date: Joi.date().allow(null).messages({
    'date.base': 'Tanggal selesai harus berupa tanggal yang valid'
  }),

  documents: Joi.object({
    ktp: Joi.string().allow(null, ''),
    asuransi: Joi.string().allow(null, ''),
    mcu: Joi.string().allow(null, ''),
    keterangan_sehat: Joi.string().allow(null, ''),
    kelakuan_baik: Joi.string().allow(null, ''),
    vaksinasi: Joi.string().allow(null, '')
  }).allow(null)
});

const employeeUpdateValidation = Joi.object({
  user: Joi.string().custom(objectIdValidator).messages({
    'any.invalid': 'User harus berupa ObjectId yang valid'
  }),

  name: Joi.string().min(2).messages({
    'string.base': 'Nama harus berupa teks',
    'string.min': 'Minimal berisi 2 huruf'
  }),

  nik: Joi.string()
    .pattern(/^[0-9]+$/)
    .length(16)

    .messages({
      'string.pattern.base': 'NIK hanya boleh berisi angka',
      'string.length': 'NIK harus 16 digit'
    }),

  age: Joi.number().integer().positive().min(1).messages({
    'number.base': 'Umur harus berupa angka',
    'number.min': 'Umur minimal 1 tahun',
    'number.positive': 'Umur harus lebih dari 0',
    'number.integer': 'Umur harus bilangan bulat'
  }),

  address: Joi.string().messages({
    'string.base': 'Alamat harus berupa teks'
  }),

  phone: Joi.string()
    .pattern(/^[0-9]{10,15}$/)

    .messages({
      'string.pattern.base':
        'Nomor telepon harus terdiri dari 10 sampai 15 digit angka'
    }),

  employment_type: Joi.string()
    .valid('Freelance', 'Karyawan')

    .messages({
      'any.only': 'Tipe pekerjaan harus Freelance atau Karyawan'
    }),

  religion: Joi.string()
    .valid('Islam', 'Protestan', 'Katolik', 'Budha', 'Hindu', 'Konghucu')
    .allow(null, ''),
  height: Joi.number().positive(),
  weight: Joi.number().positive(),
  number_of_children: Joi.number().integer().min(0),
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

  position: Joi.string().valid('Admin', 'Karyawan').messages({
    'any.only': 'Posisi harus Admin atau Karyawan'
  }),

  blood_type: Joi.string()
    .valid('A', 'B', 'AB', 'O')
    .allow(null, '')

    .messages({
      'any.only': 'Golongan darah hanya boleh A, B, AB, atau O'
    }),

  start_date: Joi.date().allow(null).messages({
    'date.base': 'Tanggal mulai harus berupa tanggal yang valid'
  }),

  end_date: Joi.date().allow(null).messages({
    'date.base': 'Tanggal selesai harus berupa tanggal yang valid'
  }),

  documents: Joi.object({
    ktp: Joi.string().allow(null, ''),
    asuransi: Joi.string().allow(null, ''),
    mcu: Joi.string().allow(null, ''),
    keterangan_sehat: Joi.string().allow(null, ''),
    kelakuan_baik: Joi.string().allow(null, ''),
    vaksinasi: Joi.string().allow(null, '')
  }).allow(null)
});

module.exports = { employeeCreateValidation, employeeUpdateValidation };
