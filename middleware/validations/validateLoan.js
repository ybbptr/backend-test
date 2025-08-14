const Joi = require('joi');
const mongoose = require('mongoose');

const loanSchema = Joi.object({
  loan_number: Joi.string().required().messages({
    'string.empty': 'Nomor peminjaman wajib diisi!',
    'any.required': 'Nomor peminjaman wajib diisi!'
  }),
  loan_date: Joi.date().required().messages({
    'date.base': 'Tanggal peminjaman harus berupa tanggal!',
    'any.required': 'Tanggal peminjaman wajib diisi!'
  }),
  return_date: Joi.date()
    .min(Joi.ref('loan_date')) // memastikan return_date >= loan_date
    .required()
    .messages({
      'date.base': 'Tanggal pengembalian harus berupa tanggal!',
      'date.min':
        'Tanggal pengembalian tidak boleh lebih awal dari tanggal peminjaman!',
      'any.required': 'Tanggal pengembalian wajib diisi!'
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
      'any.invalid': 'Employee ID tidak valid!',
      'any.required': 'Employee wajib diisi!'
    }),
  product: Joi.string()
    .custom((value, helpers) => {
      if (!mongoose.Types.ObjectId.isValid(value)) {
        return helpers.error('any.invalid');
      }
      return value;
    })
    .required()
    .messages({
      'any.invalid': 'Product ID tidak valid!',
      'any.required': 'Barang wajib diisi!'
    }),
  approval: Joi.string()
    .valid('Disetujui', 'Ditolak', 'Diproses')
    .default('Diproses')
    .messages({
      'any.only':
        'Persetujuan harus salah satu dari: Disetujui, Ditolak, Diproses!',
      'any.required': 'Persetujuan wajib diisi!'
    }),
  warehouse: Joi.string()
    .custom((value, helpers) => {
      if (!mongoose.Types.ObjectId.isValid(value)) {
        return helpers.error('any.invalid');
      }
      return value;
    })
    .required()
    .messages({
      'any.invalid': 'ID gudang tidak valid!',
      'any.required': 'Gudang wajib diisi!'
    }),
  loan_quantity: Joi.number().positive().allow(null).required().messages({
    'any.required': 'Jumlah barang yang dipinjam wajib diisi!',
    'number.positive': 'Masukkan angka yang valid!'
  })
});

module.exports = loanSchema;
