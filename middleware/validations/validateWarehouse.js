const Joi = require('joi');

const warehouseSchema = Joi.object({
  warehouse_code: Joi.string().required().messages({
    'any.required': 'Kode gudang wajib diisi!',
    'string.empty': 'Kode gudang tidak boleh kosong!'
  }),
  warehouse_name: Joi.string().required().messages({
    'any.required': 'Nama gudang wajib diisi!',
    'string.empty': 'Nama gudang tidak boleh kosong!'
  }),
  description: Joi.string().allow('', null)
}).unknown(true);

module.exports = warehouseSchema;
