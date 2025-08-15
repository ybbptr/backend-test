const Joi = require('joi');
const mongoose = require('mongoose');

const productSchema = Joi.object({
  product_code: Joi.string().required().messages({
    'any.required': 'Kode barang wajib diisi!',
    'string.empty': 'Kode barang tidak boleh kosong!'
  }),
  product_name: Joi.string().required().messages({
    'any.required': 'Nama barang wajib diisi!',
    'string.empty': 'Nama barang tidak boleh kosong!'
  }),
  description: Joi.string().allow('', null),
  quantity: Joi.number().integer().min(0).messages({
    'number.base': 'Kuantitas barang harus berupa angka!'
  }),
  condition: Joi.string()
    .valid('Rusak ringan', 'Rusak berat', 'Baik', 'Baru')
    .default('Baik')
    .messages({
      'any.only':
        'Persetujuan harus salah satu dari: Rusak ringan, Rusak berat, Baik, Baru!',
      'any.required': 'Kondisi wajib diisi!'
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
  shelf: Joi.string()
    .custom((value, helpers) => {
      if (!mongoose.Types.ObjectId.isValid(value)) {
        return helpers.error('any.invalid');
      }
      return value;
    })
    .required()
    .messages({
      'any.invalid': 'ID lemari tidak valid!',
      'any.required': 'Lemari wajib diisi!'
    })
});

module.exports = productSchema;
