const Joi = require('joi');
const mongoose = require('mongoose');

const objectId = (label) =>
  Joi.string()
    .custom((v, h) =>
      mongoose.Types.ObjectId.isValid(v) ? v : h.error('any.invalid')
    )
    .messages({
      'any.invalid': `${label} tidak valid!`,
      'string.base': `${label} harus berupa string`,
      'string.empty': `${label} tidak boleh kosong`
    });

/* ================= CREATE ================= */
const createLoanSchema = Joi.object({
  borrower: objectId('ID karyawan').required().messages({
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
    'any.required': 'Posisi karyawan wajib diisi'
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
    'any.required': 'Tanggal formulir wajib diisi'
  }),
  pickup_date: Joi.date().required().messages({
    'any.required': 'Tanggal pengambilan wajib diisi'
  }),
  inventory_manager: Joi.string()
    .valid('Owan H.', 'Teguh F.', 'Korlap')
    .required()
    .messages({
      'any.required': 'Penanggung jawab wajib diisi',
      'any.only': 'Penanggung jawab hanya Owan H., Teguh F., dan Korlap'
    }),
  warehouse_to: objectId('ID gudang tujuan').required().messages({
    'any.required': 'Gudang tujuan wajib diisi!'
  }),

  // FE hanya kirim minimal; sisanya di-resolve dari Inventory di controller
  borrowed_items: Joi.alternatives()
    .try(
      Joi.array()
        .items(
          Joi.object({
            inventory: objectId('ID inventory').required().messages({
              'any.required': 'Inventory wajib diisi!'
            }),
            quantity: Joi.number().min(1).required().messages({
              'any.required': 'Jumlah pinjam wajib diisi',
              'number.min': 'Jumlah pinjam minimal 1'
            }),
            project: objectId('ID project').allow(null, '').optional()
          })
        )
        .min(1)
        .required(),
      Joi.string().custom((val, helpers) => {
        try {
          const parsed = JSON.parse(val);
          if (!Array.isArray(parsed)) throw new Error();
          return parsed;
        } catch {
          return helpers.error('any.invalid');
        }
      })
    )
    .messages({
      'array.min': 'Minimal harus ada 1 barang yang dipinjam',
      'any.required': 'Barang yang dipinjam wajib diisi',
      'any.invalid': 'borrowed_items harus berupa array JSON yang valid'
    })
});

/* ================= UPDATE ================= */
const updateLoanSchema = Joi.object({
  borrower: objectId('ID karyawan').optional(),
  nik: Joi.string().optional(),
  address: Joi.string().optional(),
  position: Joi.string().optional(),
  phone: Joi.string()
    .pattern(/^[0-9]+$/)
    .optional()
    .messages({
      'string.pattern.base': 'Nomor HP hanya boleh berisi angka'
    }),
  loan_date: Joi.date().optional(),
  pickup_date: Joi.date().optional(),
  inventory_manager: Joi.string()
    .valid('Owan H.', 'Teguh F.', 'Korlap')
    .optional(),
  warehouse_to: objectId('ID gudang tujuan').optional(),

  // Jika FE kirim items → kita rebuild full array (controller kamu sudah seperti itu)
  borrowed_items: Joi.alternatives().try(
    Joi.array().items(
      Joi.object({
        inventory: objectId('ID inventory').required().messages({
          'any.required': 'Inventory wajib diisi!'
        }),
        quantity: Joi.number().min(1).required().messages({
          'any.required': 'Jumlah pinjam wajib diisi',
          'number.min': 'Jumlah pinjam minimal 1'
        }),
        project: objectId('ID project').allow(null, '').optional()
      })
    ),
    Joi.string().custom((val, helpers) => {
      try {
        const parsed = JSON.parse(val);
        if (!Array.isArray(parsed)) throw new Error();
        return parsed;
      } catch {
        return helpers.error('any.invalid');
      }
    })
  )
});

module.exports = { createLoanSchema, updateLoanSchema };
