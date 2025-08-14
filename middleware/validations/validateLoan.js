const Joi = require('joi');
const mongoose = require('mongoose');

const loanSchema = Joi.object({
  loan_number: Joi.string().required().messages({
    'string.empty': 'Nomor peminjaman wajib diisi',
    'any.required': 'Nomor peminjaman wajib diisi'
  }),
  loan_date: Joi.date().required().messages({
    'date.base': 'Tanggal peminjaman harus berupa tanggal',
    'any.required': 'Tanggal peminjaman wajib diisi'
  }),
  return_date: Joi.date()
    .min(Joi.ref('loan_date')) // memastikan return_date >= loan_date
    .required()
    .messages({
      'date.base': 'Tanggal pengembalian harus berupa tanggal',
      'date.min':
        'Tanggal pengembalian tidak boleh lebih awal dari tanggal peminjaman',
      'any.required': 'Tanggal pengembalian wajib diisi'
    }),
  employee: Joi.string()
    .custom((value, helpers) => {
      if (!mongoose.Types.ObjectId.isValid(value)) {
        return helpers.error('any.invalid');
      }
      return value;
    })
    .required()
    .messages({
      'any.invalid': 'Employee ID tidak valid',
      'any.required': 'Employee wajib diisi'
    }),
  approval: Joi.string()
    .valid('Disetujui', 'Ditolak', 'Diproses')
    .default('Diproses')
    .messages({
      'any.only':
        'Persetujuan harus salah satu dari: Disetujui, Ditolak, Diproses',
      'any.required': 'Persetujuan wajib diisi'
    }),
  project_type: Joi.string()
    .valid('SIS', 'SLS', 'Topography')
    .required()
    .messages({
      'any.only': 'Project type harus salah satu dari: SIS, SLS, Topography',
      'any.required': 'Project type wajib diisi'
    })
});

module.exports = loanSchema;
