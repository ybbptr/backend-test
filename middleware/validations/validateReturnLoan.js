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

/** Item-level schema (dipakai untuk create & update draft) */
const returnedItemSchema = Joi.object({
  // _id item sirkulasi (LoanCirculation.borrowed_items._id)
  _id: objectId('ID item sirkulasi').required().messages({
    'any.required': 'ID item sirkulasi wajib diisi'
  }),
  // inventory diperlukan oleh finalize → wajib ada di payload
  inventory: objectId('ID inventory').required().messages({
    'any.required': 'ID inventory wajib diisi'
  }),
  quantity: Joi.number().integer().min(1).required().messages({
    'any.required': 'Jumlah wajib diisi',
    'number.min': 'Jumlah minimal 1'
  }),
  condition_new: Joi.string()
    .valid('Baik', 'Rusak', 'Maintenance', 'Hilang')
    .required(),

  // gudang/shelf pengembalian:
  // - kalau Hilang → TIDAK boleh diisi
  // - selain itu → opsional saat draft, akan diwajibkan saat FINALIZE server-side
  warehouse_return: Joi.alternatives().conditional('condition_new', {
    is: 'Hilang',
    then: Joi.any().valid(null, '').messages({
      'any.only': 'warehouse_return tidak boleh diisi untuk kondisi "Hilang"'
    }),
    otherwise: objectId('ID gudang pengembalian').allow(null, '').optional()
  }),
  shelf_return: objectId('ID lemari pengembalian').allow(null, '').optional(),

  project: objectId('ID proyek').allow(null, '').optional(),

  // UI helper
  needs_review: Joi.boolean().default(false),

  // alasan wajib jika "Hilang"
  loss_reason: Joi.alternatives().conditional('condition_new', {
    is: 'Hilang',
    then: Joi.string().trim().min(3).required().messages({
      'any.required': 'Alasan kehilangan wajib diisi bila kondisi "Hilang"',
      'string.min': 'Alasan kehilangan terlalu pendek'
    }),
    otherwise: Joi.any().strip() // kalau bukan "Hilang", field ini dibuang
  }),

  // data turunan (opsional saja; server tidak mengandalkan ini)
  product: objectId('ID barang').optional(),
  product_code: Joi.string().optional(),
  brand: Joi.string().optional()
});

/* ================= CREATE (Draft) ================= */
const validateReturnLoan = Joi.object({
  loan_number: Joi.string().required().messages({
    'any.required': 'Nomor peminjaman wajib diisi'
  }),
  borrower: objectId('ID karyawan').optional(), // bisa diisi/diambil dari auth
  position: Joi.string().optional(),
  report_date: Joi.date().optional(),
  return_date: Joi.date().required().messages({
    'any.required': 'Tanggal pengembalian wajib diisi'
  }),
  inventory_manager: Joi.string()
    .valid('Owan H.', 'Teguh F.', 'Korlap')
    .required()
    .messages({
      'any.required': 'Penanggung jawab wajib diisi',
      'any.only': 'Penanggung jawab hanya boleh Owan H., Teguh F., atau Korlap'
    }),
  returned_items: Joi.alternatives()
    .try(
      Joi.array().items(returnedItemSchema).min(1).required(),
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
      'array.min': 'Minimal harus ada 1 item pengembalian',
      'any.required': 'Daftar barang pengembalian wajib diisi',
      'any.invalid': 'Format returned_items harus berupa array JSON yang valid'
    })
});

/* ================= UPDATE (Draft) ================= */
const validateUpdateReturnLoan = Joi.object({
  return_date: Joi.date().optional(),
  inventory_manager: Joi.string()
    .valid('Owan H.', 'Teguh F.', 'Korlap')
    .optional(),
  position: Joi.string().optional(),
  borrower: objectId('ID karyawan').optional(),

  // Controller kamu melakukan "replace full array", jadi tetap wajib kirim array.
  returned_items: Joi.alternatives()
    .try(
      Joi.array().items(returnedItemSchema).min(1).required(),
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
      'array.min': 'Minimal harus ada 1 item pengembalian',
      'any.required': 'Daftar barang pengembalian wajib diisi',
      'any.invalid': 'Format returned_items harus berupa array JSON yang valid'
    })
});

module.exports = { validateReturnLoan, validateUpdateReturnLoan };
