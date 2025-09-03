const Joi = require('joi');

// Detail item schema
const detailSchema = Joi.object({
  purpose: Joi.string().required().messages({
    'string.base': 'Keperluan harus berupa teks',
    'any.required': 'Keperluan wajib diisi'
  }),
  category: Joi.string().required().messages({
    'string.base': 'Kategori harus berupa teks',
    'any.required': 'Kategori wajib diisi'
  }),
  quantity: Joi.number().integer().min(1).required().messages({
    'number.base': 'Quantity harus berupa angka',
    'number.min': 'Quantity minimal 1',
    'any.required': 'Quantity wajib diisi'
  }),
  unit_price: Joi.number().min(0).required().messages({
    'number.base': 'Harga satuan harus berupa angka',
    'number.min': 'Harga satuan tidak boleh negatif',
    'any.required': 'Harga satuan wajib diisi'
  }),
  amount: Joi.number().min(0).required().messages({
    'number.base': 'Jumlah harus berupa angka',
    'number.min': 'Jumlah tidak boleh negatif',
    'any.required': 'Jumlah wajib diisi'
  })
});

// CREATE validation
const createExpenseRequestSchema = Joi.object({
  name: Joi.string().required().messages({
    'string.base': 'ID karyawan harus berupa teks',
    'any.required': 'Karyawan wajib diisi'
  }),
  project: Joi.string().required().messages({
    'string.base': 'ID proyek harus berupa teks',
    'any.required': 'Proyek wajib diisi'
  }),
  voucher_prefix: Joi.string()
    .valid('PDLAP', 'PDOFC', 'PDPYR')
    .required()
    .messages({
      'any.only': 'Prefix voucher hanya boleh PDLAP, PDOFC, atau PDPYR',
      'any.required': 'Prefix voucher wajib diisi'
    }),
  expense_type: Joi.string()
    .valid(
      'Persiapan Pekerjaan',
      'Operasional Lapangan',
      'Operasional Tenaga Ahli',
      'Sewa Alat',
      'Operasional Lab',
      'Pajak',
      'Biaya Lain'
    )
    .required()
    .messages({
      'any.only': 'Jenis biaya tidak valid',
      'any.required': 'Jenis biaya wajib diisi'
    }),
  submission_date: Joi.date().optional(),
  method: Joi.string().valid('Transfer', 'Tunai').required().messages({
    'any.only': 'Metode pembayaran harus Transfer atau Tunai',
    'any.required': 'Metode pembayaran wajib diisi'
  }),
  bank_account_number: Joi.string().allow('').optional(),
  bank: Joi.string().allow('').optional(),
  bank_branch: Joi.string().allow('').optional(),
  bank_account_holder: Joi.string().allow('').optional(),
  description: Joi.string().allow('').optional(),
  details: Joi.array().items(detailSchema).min(1).required().messages({
    'array.min': 'Minimal harus ada 1 detail keperluan'
  }),
  total_amount: Joi.number().min(1).required().messages({
    'number.base': 'Total permohonan biaya harus berupa angka',
    'number.min': 'Total permohonan biaya minimal 1',
    'any.required': 'Total permohonan biaya wajib diisi'
  })
});

// UPDATE validation
const updateExpenseRequestSchema = Joi.object({
  voucher_prefix: Joi.string().valid('PDLAP', 'PDOFC', 'PDPYR').optional(),
  expense_type: Joi.string()
    .valid(
      'Persiapan Pekerjaan',
      'Operasional Lapangan',
      'Operasional Tenaga Ahli',
      'Sewa Alat',
      'Operasional Lab',
      'Pajak',
      'Biaya Lain'
    )
    .optional(),
  submission_date: Joi.date().optional(),
  method: Joi.string().valid('Transfer', 'Tunai').optional(),
  bank_account_number: Joi.string().allow('').optional(),
  bank: Joi.string().allow('').optional(),
  bank_branch: Joi.string().allow('').optional(),
  bank_account_holder: Joi.string().allow('').optional(),
  description: Joi.string().allow('').optional(),
  details: Joi.array().items(detailSchema).optional(),
  total_amount: Joi.number().min(1).optional(),
  status: Joi.string().valid('Diproses', 'Disetujui', 'Ditolak').optional(),
  approved_by: Joi.string().optional()
})
  .min(1)
  .messages({
    'object.min': 'Minimal harus ada 1 field yang diupdate'
  });

module.exports = {
  createExpenseRequestSchema,
  updateExpenseRequestSchema
};
