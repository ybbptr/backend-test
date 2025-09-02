const Joi = require('joi');
const mongoose = require('mongoose');

const objectIdValidator = (value, helpers) => {
  if (!mongoose.Types.ObjectId.isValid(value)) {
    return helpers.error('any.invalid');
  }
  return value;
};

const createLoanSchema = Joi.object({
  borrower: Joi.string().custom(objectIdValidator).required().messages({
    'any.invalid': 'ID karyawan tidak valid!',
    'any.required': 'Karyawan wajib diisi!'
  }),
  nik: Joi.string().required().messages({
    'any.required': 'NIK wajib diisi',
    'string.empty': 'NIK tidak boleh kosong'
  }),

  address: Joi.string().required().messages({
    'any.required': 'Alamat wajib diisi',
    'string.empty': 'Alamat tidak boleh kosong'
  }),

  phone: Joi.string()
    .pattern(/^[0-9]+$/)
    .required()
    .messages({
      'any.required': 'Nomor HP wajib diisi',
      'string.empty': 'Nomor HP tidak boleh kosong',
      'string.pattern.base': 'Nomor HP hanya boleh berisi angka'
    }),

  borrowed_items: Joi.array()
    .items(
      Joi.object({
        product: Joi.string().custom(objectIdValidator).required().messages({
          'any.invalid': 'ID barang tidak valid!',
          'any.required': 'Barang wajib diisi!'
        }),
        product_code: Joi.string().required().messages({
          'any.required': 'Kode barang wajib diisi'
        }),
        brand: Joi.string().allow('', null),
        quantity: Joi.number().min(1).required().messages({
          'any.required': 'Jumlah pinjam wajib diisi',
          'number.base': 'Jumlah pinjam harus berupa angka',
          'number.min': 'Jumlah pinjam minimal 1'
        }),
        pickup_date: Joi.date().required().messages({
          'any.required': 'Tanggal pengambilan wajib diisi',
          'date.base': 'Tanggal pengambilan harus berupa tanggal'
        }),

        return_date: Joi.date().greater(Joi.ref('loan_date')).messages({
          'date.base': 'Tanggal kembali harus berupa tanggal yang valid',
          'date.greater':
            'Tanggal kembali harus lebih besar dari tanggal pinjam'
        }),
        project: Joi.string().custom(objectIdValidator).required().messages({
          'any.invalid': 'ID project tidak valid!',
          'any.required': 'Project wajib diisi!'
        }),
        condition: Joi.string().allow('', null)
      })
    )
    .min(1)
    .required()
    .messages({
      'array.min': 'Minimal harus ada 1 barang yang dipinjam',
      'any.required': 'Barang yang dipinjam wajib diisi'
    }),

  approval: Joi.string()
    .valid('Disetujui', 'Ditolak', 'Diproses')
    .default('Diproses')
    .messages({
      'any.only':
        'Status approval hanya boleh Disetujui, Ditolak, atau Diproses'
    })
});

const updateLoanSchema = Joi.object({
  borrower: Joi.string().custom(objectIdValidator).messages({
    'any.invalid': 'ID karyawan tidak valid!'
  }),
  nik: Joi.string().messages({
    'string.empty': 'NIK tidak boleh kosong'
  }),

  address: Joi.string().messages({
    'string.empty': 'Alamat tidak boleh kosong'
  }),

  phone: Joi.string()
    .pattern(/^[0-9]+$/)
    .messages({
      'string.pattern.base': 'Nomor HP hanya boleh berisi angka'
    }),

  borrowed_items: Joi.array().items(
    Joi.object({
      product: Joi.string().custom(objectIdValidator).messages({
        'any.invalid': 'ID barang tidak valid!'
      }),
      product_code: Joi.string(),
      brand: Joi.string().allow('', null),
      quantity: Joi.number().min(1).messages({
        'number.base': 'Jumlah pinjam harus berupa angka',
        'number.min': 'Jumlah pinjam minimal 1'
      }),
      pickup_date: Joi.date().messages({
        'date.base': 'Tanggal pengambilan harus berupa tanggal'
      }),
      return_date: Joi.date().greater(Joi.ref('loan_date')).messages({
        'date.base': 'Tanggal kembali harus berupa tanggal yang valid',
        'date.greater': 'Tanggal kembali harus lebih besar dari tanggal pinjam'
      }),
      project: Joi.string().custom(objectIdValidator).messages({
        'any.invalid': 'ID project tidak valid!'
      }),
      condition: Joi.string().allow('', null)
    })
  ),
  approval: Joi.string().valid('Disetujui', 'Ditolak', 'Diproses').messages({
    'any.only': 'Status approval hanya boleh Disetujui, Ditolak, atau Diproses'
  })
});

module.exports = {
  createLoanSchema,
  updateLoanSchema
};
