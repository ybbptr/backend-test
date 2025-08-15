const Joi = require('joi');
const mongoose = require('mongoose');

const warehouseSchema = Joi.object({
  warehouse_code: Joi.string().required().messages({
    'any.required': 'Kode gudang wajib diisi!',
    'string.empty': 'Kode gudang tidak boleh kosong!'
  }),
  warehouse_name: Joi.string().required().messages({
    'any.required': 'Nama gudang wajib diisi!',
    'string.empty': 'Nama gudang tidak boleh kosong!'
  }),
  description: Joi.string().allow('', null),
  shelves: Joi.array().items(
    Joi.object({
      shelf_code: Joi.string().required(),
      shelf_name: Joi.string().required()
    })
  )
});

module.exports = warehouseSchema;
