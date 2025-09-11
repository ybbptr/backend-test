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
  position: Joi.string().required().messages({
    'any.required': 'Posisi karyawan wajib diisi',
    'string.empty': 'Posisi karyawan tidak boleh kosong'
  }),
  phone: Joi.string()
    .pattern(/^[0-9]+$/)
    .required()
    .messages({
      'any.required': 'Nomor HP wajib diisi',
      'string.empty': 'Nomor HP tidak boleh kosong',
      'string.pattern.base': 'Nomor HP hanya boleh berisi angka'
    }),
  loan_date: Joi.date().required().messages({
    'any.required': 'Tanggal formulir wajib diisi',
    'date.base': 'Tanggal formulir harus berupa tanggal yang valid'
  }),
  pickup_date: Joi.date().required().messages({
    'any.required': 'Tanggal pengambilan wajib diisi',
    'date.base': 'Tanggal pengambilan harus berupa tanggal yang valid'
  }),
  inventory_manager: Joi.string()
    .valid('Owan H.', 'Teguh F.', 'Korlap')
    .required()
    .messages({
      'any.required': 'Penanggung jawab wajib diisi',
      'any.only': 'Penanggung jawab hanya Owan H., Teguh F., dan Korlap'
    }),

  borrowed_items: Joi.array()
    .items(
      Joi.object({
        inventory: Joi.string().custom(objectIdValidator).required().messages({
          'any.invalid': 'ID inventory tidak valid!',
          'any.required': 'Inventory wajib diisi!'
        }),
        quantity: Joi.number().min(1).required().messages({
          'any.required': 'Jumlah pinjam wajib diisi',
          'number.base': 'Jumlah pinjam harus berupa angka',
          'number.min': 'Jumlah pinjam minimal 1'
        }),
        project: Joi.string().custom(objectIdValidator).required().messages({
          'any.invalid': 'ID project tidak valid!',
          'any.required': 'Project wajib diisi!'
        }),
        condition_at_borrow: Joi.string()
          .valid('Baik', 'Rusak', 'Maintenance', 'Hilang')
          .messages({
            'any.only':
              'Kondisi hanya boleh Baik, Rusak, Maintenance, atau Hilang'
          })
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
  nik: Joi.string(),
  address: Joi.string(),
  position: Joi.string(),
  phone: Joi.string()
    .pattern(/^[0-9]+$/)
    .messages({
      'string.pattern.base': 'Nomor HP hanya boleh berisi angka'
    }),
  loan_date: Joi.date(),
  pickup_date: Joi.date(),
  inventory_manager: Joi.string()
    .valid('Owan H.', 'Teguh F.', 'Korlap')
    .messages({
      'any.only': 'Penanggung jawab hanya Owan H., Teguh F., dan Korlap'
    }),

  borrowed_items: Joi.array().items(
    Joi.object({
      inventory: Joi.string().custom(objectIdValidator).messages({
        'any.invalid': 'ID inventory tidak valid!'
      }),
      quantity: Joi.number().min(1).messages({
        'number.base': 'Jumlah pinjam harus berupa angka',
        'number.min': 'Jumlah pinjam minimal 1'
      }),
      project: Joi.string().custom(objectIdValidator).messages({
        'any.invalid': 'ID project tidak valid!'
      }),
      condition_at_borrow: Joi.string()
        .valid('Baik', 'Rusak', 'Maintenance', 'Hilang')
        .messages({
          'any.only':
            'Kondisi hanya boleh Baik, Rusak, Maintenance, atau Hilang'
        })
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
