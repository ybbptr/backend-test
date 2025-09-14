const Joi = require('joi');
const mongoose = require('mongoose');

// helper validasi ObjectId
const objectId = (label) =>
  Joi.string()
    .custom((value, helpers) => {
      if (!mongoose.Types.ObjectId.isValid(value)) {
        return helpers.error('any.invalid');
      }
      return value;
    })
    .messages({
      'any.invalid': `${label} tidak valid!`,
      'string.base': `${label} harus berupa string`,
      'string.empty': `${label} tidak boleh kosong`
    });

/* =========================================================
   CREATE VALIDATION
   ========================================================= */
const validateReturnedItemCreate = Joi.object({
  inventory: objectId('ID inventory').required().messages({
    'any.required': 'ID inventory wajib diisi'
  }),
  product: objectId('ID barang').required().messages({
    'any.required': 'ID barang wajib diisi'
  }),
  product_code: Joi.string().required().messages({
    'any.required': 'Kode barang wajib diisi'
  }),
  brand: Joi.string().required().messages({
    'any.required': 'Merek wajib diisi'
  }),
  quantity: Joi.number().integer().min(1).required().messages({
    'any.required': 'Jumlah wajib diisi',
    'number.min': 'Jumlah minimal 1'
  }),
  warehouse_return: objectId('ID gudang pengembalian').allow(null, ''),
  shelf_return: objectId('ID lemari pengembalian').allow(null, ''),
  condition_new: Joi.string()
    .valid('Baik', 'Rusak', 'Maintenance', 'Hilang')
    .required()
    .messages({
      'any.only':
        'Kondisi barang hanya boleh: Baik, Rusak, Maintenance, atau Hilang'
    }),
  project: objectId('ID proyek').optional().allow(null, ''),
  proof_image: Joi.alternatives().conditional('condition_new', {
    is: 'Hilang',
    then: Joi.any().valid(null).optional(),
    otherwise: Joi.object({
      key: Joi.string().required(),
      contentType: Joi.string().optional(),
      size: Joi.number().optional(),
      uploadedAt: Joi.date().optional()
    }).optional()
  })
});

const validateReturnLoan = Joi.object({
  loan_number: Joi.string().required().messages({
    'any.required': 'Nomor peminjaman wajib diisi'
  }),
  borrower: objectId('ID karyawan').optional(),
  position: Joi.string().required().messages({
    'any.required': 'Jabatan wajib diisi'
  }),
  report_date: Joi.date().required().messages({
    'any.required': 'Tanggal laporan wajib diisi'
  }),
  return_date: Joi.date().required().messages({
    'any.required': 'Tanggal pengembalian wajib diisi'
  }),
  inventory_manager: Joi.string()
    .valid('Owan H.', 'Teguh F.', 'Korlap')
    .required()
    .messages({
      'any.only': 'Penanggung jawab hanya boleh Owan H., Teguh F., atau Korlap'
    }),
  returned_items: Joi.alternatives()
    .try(
      Joi.array().items(validateReturnedItemCreate),
      Joi.string().custom((value, helpers) => {
        try {
          const parsed = JSON.parse(value);
          if (!Array.isArray(parsed)) throw new Error();
          return parsed;
        } catch (err) {
          return helpers.error('any.invalid');
        }
      })
    )
    .required()
    .messages({
      'any.required': 'Daftar barang pengembalian wajib diisi',
      'any.invalid': 'Format returned_items harus berupa array JSON yang valid',
      'array.base': 'returned_items harus berupa array'
    })
});

/* =========================================================
   UPDATE VALIDATION
   ========================================================= */
const validateReturnedItemUpdate = Joi.object({
  _id: objectId('ID returned_item').required().messages({
    'any.required': 'ID item pengembalian wajib diisi untuk update'
  }),
  quantity: Joi.number().integer().min(1).optional(),
  warehouse_return: objectId('ID gudang pengembalian')
    .optional()
    .allow(null, ''),
  shelf_return: objectId('ID lemari pengembalian').optional().allow(null, ''),
  condition_new: Joi.string()
    .valid('Baik', 'Rusak', 'Maintenance', 'Hilang')
    .optional(),
  proof_image: Joi.alternatives().conditional('condition_new', {
    is: 'Hilang',
    then: Joi.any().valid(null).optional(),
    otherwise: Joi.object({
      key: Joi.string().required(),
      contentType: Joi.string().optional(),
      size: Joi.number().optional(),
      uploadedAt: Joi.date().optional()
    }).optional()
  })
});

const validateUpdateReturnLoan = Joi.object({
  return_date: Joi.date().optional(),
  returned_items: Joi.alternatives()
    .try(
      Joi.array().items(validateReturnedItemUpdate),
      Joi.string().custom((value, helpers) => {
        try {
          const parsed = JSON.parse(value);
          if (!Array.isArray(parsed)) throw new Error();
          return parsed;
        } catch (err) {
          return helpers.error('any.invalid');
        }
      })
    )
    .required()
    .messages({
      'any.required': 'Daftar barang pengembalian wajib diisi',
      'any.invalid': 'Format returned_items harus berupa array JSON yang valid',
      'array.base': 'returned_items harus berupa array'
    })
});

module.exports = { validateReturnLoan, validateUpdateReturnLoan };
