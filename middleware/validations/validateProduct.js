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

  category: Joi.string().required().messages({
    'any.required': 'Kategori wajib diisi',
    'string.base': 'Kategori harus berupa teks'
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

  // initial stock untuk inventory
  initial_stock: Joi.object({
    warehouse: Joi.string().custom(objectIdValidator).required().messages({
      'any.required': 'Gudang wajib diisi',
      'any.invalid': 'ID gudang tidak valid'
    }),
    shelf: Joi.string().custom(objectIdValidator).required().messages({
      'any.required': 'Lemari wajib diisi',
      'any.invalid': 'ID lemari tidak valid'
    }),
    condition: Joi.string()
      .valid('Baik', 'Rusak', 'Maintenance')
      .default('Baik')
      .messages({
        'any.only':
          'Kondisi harus salah satu dari: Baik, Rusak, atau Maintenance'
      }),
    quantity: Joi.number().min(1).required().messages({
      'any.required': 'Jumlah stok wajib diisi',
      'number.base': 'Jumlah stok harus berupa angka',
      'number.min': 'Jumlah stok minimal 1'
    })
  })
    .required()
    .messages({
      'any.required': 'Stok awal wajib diisi',
      'object.base': 'Stok awal harus berupa objek'
    }),

  description: Joi.string().allow('', null).messages({
    'string.base': 'Deskripsi harus berupa teks'
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
