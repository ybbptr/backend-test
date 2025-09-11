const Joi = require('joi');
const mongoose = require('mongoose');

const objectIdValidator = (value, helpers) => {
  if (!mongoose.Types.ObjectId.isValid(value)) {
    return helpers.error('any.invalid');
  }
  return value;
};

const createProductSchema = Joi.object({
  product_code: Joi.string().required().messages({
    'any.required': 'Kode barang wajib diisi',
    'string.base': 'Kode barang harus berupa teks'
  }),

  category: Joi.string()
    .valid(
      'Bor',
      'CPTU',
      'Sondir',
      'Topography',
      'Geolistrik',
      'Aksesoris',
      'Alat lab',
      'Perlengkapan lainnya'
    )
    .required()
    .messages({
      'any.required': 'Jenis alat wajib diisi',
      'any.only': 'Jenis alat harus salah satu dari daftar yang tersedia'
    }),

  brand: Joi.string().required().messages({
    'any.required': 'Merk wajib diisi',
    'string.base': 'Merk harus berupa teks'
  }),

  type: Joi.string().required().messages({
    'any.required': 'Tipe wajib diisi',
    'string.base': 'Tipe harus berupa teks'
  }),

  description: Joi.string().allow('', null),

  purchase_date: Joi.date().required().messages({
    'any.required': 'Tanggal pembelian wajib diisi',
    'date.base': 'Tanggal pembelian harus berupa tanggal yang valid'
  }),

  price: Joi.number().required().messages({
    'any.required': 'Harga wajib diisi',
    'number.base': 'Harga harus berupa angka'
  })
});

const updateProductSchema = Joi.object({
  product_code: Joi.string().messages({
    'string.base': 'Kode barang harus berupa teks'
  }),

  category: Joi.string()
    .valid(
      'Bor',
      'CPTU',
      'Sondir',
      'Topography',
      'Geolistrik',
      'Aksesoris',
      'Alat lab',
      'Perlengkapan lainnya'
    )
    .messages({
      'any.only': 'Jenis alat harus salah satu dari daftar yang tersedia'
    }),

  brand: Joi.string().messages({
    'string.base': 'Merk harus berupa teks'
  }),

  type: Joi.string().messages({
    'string.base': 'Tipe harus berupa teks'
  }),

  description: Joi.string().allow('', null),

  purchase_date: Joi.date().messages({
    'date.base': 'Tanggal pembelian harus berupa tanggal yang valid'
  }),

  price: Joi.number().messages({
    'number.base': 'Harga harus berupa angka'
  })
});

module.exports = {
  createProductSchema,
  updateProductSchema
};
