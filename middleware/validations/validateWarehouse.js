const Joi = require('joi');

const createWarehouseSchema = Joi.object({
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
      shelf_code: Joi.string().required().messages({
        'any.required': 'Kode lemari wajib diisi!',
        'string.empty': 'Kode lemari tidak boleh kosong!'
      }),
      shelf_name: Joi.string().required().messages({
        'any.required': 'Nama lemari wajib diisi!',
        'string.empty': 'Nama lemari tidak boleh kosong!'
      })
    })
  )
});

const updateWarehouseSchema = Joi.object({
  warehouse_code: Joi.string().optional().messages({
    'string.empty': 'Kode gudang tidak boleh kosong!'
  }),
  warehouse_name: Joi.string().optional().messages({
    'string.empty': 'Nama gudang tidak boleh kosong!'
  }),
  description: Joi.string().allow('', null),
  shelves: Joi.array().items(
    Joi.object({
      shelf_code: Joi.string().optional(),
      shelf_name: Joi.string().optional()
    })
  )
});

module.exports = {
  createWarehouseSchema,
  updateWarehouseSchema
};
