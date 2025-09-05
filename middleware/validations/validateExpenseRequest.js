const Joi = require('joi');
const mongoose = require('mongoose');

const objectIdValidator = (value, helpers) => {
  if (!mongoose.Types.ObjectId.isValid(value)) {
    return helpers.error('any.invalid');
  }
  return value;
};

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
  amount: Joi.number().min(0).optional().messages({
    'number.base': 'Jumlah harus berupa angka',
    'number.min': 'Jumlah tidak boleh negatif'
  })
});

const createExpenseRequestSchema = Joi.object({
  name: Joi.custom(objectIdValidator).required().messages({
    'any.invalid': 'ID karyawan tidak valid!',
    'any.required': 'Karyawan wajib diisi'
  }),
  project: Joi.custom(objectIdValidator).required().messages({
    'any.invalid': 'ID Proyek tidak valid!',
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
  bank_account_number: Joi.string().when('method', {
    is: 'Transfer',
    then: Joi.required().messages({
      'any.required': 'Nomor rekening wajib diisi jika metode Transfer'
    }),
    otherwise: Joi.optional().allow(null, '')
  }),
  bank: Joi.string().when('method', {
    is: 'Transfer',
    then: Joi.required().messages({
      'any.required': 'Bank wajib diisi jika metode Transfer'
    }),
    otherwise: Joi.optional().allow(null, '')
  }),
  bank_branch: Joi.string().when('method', {
    is: 'Transfer',
    then: Joi.required().messages({
      'any.required': 'Cabang bank wajib diisi jika metode Transfer'
    }),
    otherwise: Joi.optional().allow(null, '')
  }),
  bank_account_holder: Joi.string().when('method', {
    is: 'Transfer',
    then: Joi.required().messages({
      'any.required': 'Pemilik rekening wajib diisi jika metode Transfer'
    }),
    otherwise: Joi.optional().allow(null, '')
  }),
  description: Joi.string().allow('', null),
  details: Joi.array().items(detailSchema).min(1).required().messages({
    'array.min': 'Minimal harus ada 1 detail keperluan'
  }),
  total_amount: Joi.number().min(1).messages({
    'number.base': 'Total permohonan biaya harus berupa angka',
    'number.min': 'Total permohonan biaya minimal 1'
  })
});

const updateExpenseRequestSchema = createExpenseRequestSchema
  .keys({
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
    status: Joi.string().valid('Diproses', 'Disetujui', 'Ditolak').optional(),
    approved_by: Joi.custom(objectIdValidator).optional().messages({
      'any.invalid': 'ID approved_by tidak valid'
    }),
    paid_by: Joi.custom(objectIdValidator).optional().messages({
      'any.invalid': 'ID paid_by tidak valid'
    })
  })
  .min(1)
  .messages({
    'object.min': 'Minimal harus ada 1 field yang diupdate'
  });

module.exports = {
  createExpenseRequestSchema,
  updateExpenseRequestSchema
};
