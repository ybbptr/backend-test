const Joi = require('joi');
const mongoose = require('mongoose');

const warehouseSchema = Joi.object({
  shelf_code: Joi.string().required().messages({
    'any.required': 'Kode lemari wajib diisi!',
    'string.empty': 'Kode lemari tidak boleh kosong!'
  }),
  shelf_name: Joi.string().required().messages({
    'any.required': 'Nama lemari wajib diisi!',
    'string.empty': 'Nama lemari tidak boleh kosong!'
  }),
  description: Joi.string().allow('', null),
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
    })
});

module.exports = warehouseSchema;
