const Joi = require('joi');
const mongoose = require('mongoose');

const objectIdValidator = (value, helpers) => {
  if (!mongoose.Types.ObjectId.isValid(value)) {
    return helpers.error('any.invalid');
  }
  return value;
};

const createProductSchema = Joi.object({
  purchase_date: Joi.date().required().messages({
    'any.required': 'Tanggal pembelian wajib diisi',
    'date.base': 'Tanggal pembelian harus berupa tanggal yang valid'
  }),

  price: Joi.number().required().messages({
    'any.required': 'Harga wajib diisi',
    'number.base': 'Harga harus berupa angka'
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

  brand: Joi.string().allow('', null).messages({
    'string.base': 'Merk harus berupa teks'
  }),

  product_code: Joi.string().required().messages({
    'any.required': 'Kode barang wajib diisi',
    'string.base': 'Kode barang harus berupa teks'
  }),

  type: Joi.string().allow('', null).messages({
    'string.base': 'Tipe harus berupa teks'
  }),

  quantity: Joi.number().min(0).required().messages({
    'any.required': 'Jumlah wajib diisi',
    'number.base': 'Jumlah harus berupa angka',
    'number.min': 'Jumlah tidak boleh kurang dari 0'
  }),

  condition: Joi.string()
    .valid('Maintenance', 'Rusak', 'Baik')
    .required()
    .messages({
      'any.required': 'Kondisi wajib diisi',
      'any.only': 'Kondisi harus salah satu dari: Maintenance, Rusak, atau Baik'
    }),

  warehouse: Joi.string().custom(objectIdValidator).required().messages({
    'any.invalid': 'ID gudang tidak valid!',
    'any.required': 'Gudang wajib diisi!'
  }),

  shelf: Joi.string().custom(objectIdValidator).required().messages({
    'any.invalid': 'ID lemari tidak valid!',
    'any.required': 'Lemari wajib diisi!'
  }),

  description: Joi.string().allow('', null)
});

const updateProductSchema = Joi.object({
  purchase_date: Joi.date().messages({
    'date.base': 'Tanggal pembelian harus berupa tanggal yang valid'
  }),

  price: Joi.number().messages({
    'number.base': 'Harga harus berupa angka'
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

  brand: Joi.string().allow('', null).messages({
    'string.base': 'Merk harus berupa teks'
  }),

  product_code: Joi.string().messages({
    'string.base': 'Kode barang harus berupa teks'
  }),

  type: Joi.string().allow('', null).messages({
    'string.base': 'Tipe harus berupa teks'
  }),

  quantity: Joi.number().min(0).messages({
    'number.base': 'Jumlah harus berupa angka',
    'number.min': 'Jumlah tidak boleh kurang dari 0'
  }),

  condition: Joi.string().valid('Maintenance', 'Rusak', 'Baik').messages({
    'any.only': 'Kondisi harus salah satu dari: Maintenance, Rusak, atau Baik'
  }),

  warehouse: Joi.string().custom(objectIdValidator).messages({
    'any.invalid': 'ID gudang tidak valid!'
  }),

  shelf: Joi.string().custom(objectIdValidator).messages({
    'any.invalid': 'ID lemari tidak valid!'
  }),

  description: Joi.string().allow('', null)
});

module.exports = {
  createProductSchema,
  updateProductSchema
};
