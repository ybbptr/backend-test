const Joi = require('joi');

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
  place: Joi.string()
}).unknown(true);

module.exports = productSchema;
