const Joi = require('joi');
const mongoose = require('mongoose');

const objectId = Joi.string().custom((value, helpers) => {
  if (!mongoose.Types.ObjectId.isValid(value))
    return helpers.error('any.invalid');
  return value;
}, 'ObjectId validator');

const ER_PREFIXES = ['PDLAP', 'PDOFC', 'PDPYR'];
const ER_TYPES = [
  'Persiapan Pekerjaan',
  'Operasional Lapangan',
  'Operasional Tenaga Ahli',
  'Sewa Alat',
  'Operasional Lab',
  'Pajak',
  'Biaya Lain'
];

// Admin boleh supply "name" (requester). Non-admin: strip.
const requesterField = Joi.alternatives().conditional('$role', {
  is: 'admin',
  then: objectId
    .optional()
    .messages({ 'any.invalid': 'ID karyawan (name) tidak valid' }),
  otherwise: Joi.any().strip()
});

const detailSchema = Joi.object({
  purpose: Joi.string().required().messages({
    'string.base': 'Keperluan harus berupa teks',
    'string.empty': 'Keperluan tidak boleh kosong',
    'any.required': 'Keperluan wajib diisi'
  }),
  category: Joi.string().required().messages({
    'string.base': 'Kategori harus berupa teks',
    'string.empty': 'Kategori tidak boleh kosong',
    'any.required': 'Kategori wajib diisi'
  }),
  quantity: Joi.number().integer().min(1).required().messages({
    'number.base': 'Quantity harus berupa angka',
    'number.integer': 'Quantity harus bilangan bulat',
    'number.min': 'Quantity minimal 1',
    'any.required': 'Quantity wajib diisi'
  }),
  unit_price: Joi.number().min(0).required().messages({
    'number.base': 'Harga satuan harus berupa angka',
    'number.min': 'Harga satuan tidak boleh negatif',
    'any.required': 'Harga satuan wajib diisi'
  }),
  // dihitung backend → strip agar tidak bisa disuntik FE
  amount: Joi.any().strip(),
  is_overbudget: Joi.any().strip()
});

const createExpenseRequestSchema = Joi.object({
  // role-aware
  name: requesterField,

  project: objectId.required().messages({
    'any.invalid': 'ID proyek tidak valid',
    'any.required': 'Proyek wajib diisi'
  }),

  voucher_prefix: Joi.string()
    .valid(...ER_PREFIXES)
    .required()
    .messages({
      'any.only': 'Prefix voucher hanya boleh PDLAP, PDOFC, atau PDPYR',
      'any.required': 'Prefix voucher wajib diisi'
    }),

  expense_type: Joi.string()
    .valid(...ER_TYPES)
    .required()
    .messages({
      'any.only': 'Jenis biaya tidak valid',
      'any.required': 'Jenis biaya wajib diisi'
    }),

  submission_date: Joi.date()
    .optional()
    .messages({ 'date.base': 'Tanggal pengajuan tidak valid' }),

  method: Joi.string().valid('Transfer', 'Tunai').required().messages({
    'any.only': 'Metode pembayaran hanya boleh Transfer atau Tunai',
    'any.required': 'Metode pembayaran wajib diisi'
  }),
  bank_account_number: Joi.string().when('method', {
    is: 'Transfer',
    then: Joi.required().messages({
      'any.required': 'Nomor rekening wajib diisi (Transfer)'
    }),
    otherwise: Joi.optional().allow(null, '')
  }),
  bank: Joi.string().when('method', {
    is: 'Transfer',
    then: Joi.required().messages({
      'any.required': 'Bank wajib diisi (Transfer)'
    }),
    otherwise: Joi.optional().allow(null, '')
  }),
  bank_branch: Joi.string().when('method', {
    is: 'Transfer',
    then: Joi.required().messages({
      'any.required': 'Cabang bank wajib diisi (Transfer)'
    }),
    otherwise: Joi.optional().allow(null, '')
  }),
  bank_account_holder: Joi.string().when('method', {
    is: 'Transfer',
    then: Joi.required().messages({
      'any.required': 'Pemilik rekening wajib diisi (Transfer)'
    }),
    otherwise: Joi.optional().allow(null, '')
  }),

  description: Joi.string().allow('', null),
  note: Joi.string()
    .allow('', null)
    .when('status', {
      is: 'Ditolak',
      then: Joi.required().messages({
        'any.required': 'Alasan penolakan wajib diisi'
      }),
      otherwise: Joi.optional()
    }),

  status: Joi.string().valid('Diproses', 'Disetujui', 'Ditolak').messages({
    'any.only': 'Status tidak valid'
  }),
  approved_by: objectId
    .when('status', {
      is: 'Disetujui',
      then: Joi.required().messages({
        'any.required': 'approved_by wajib diisi saat Disetujui'
      }),
      otherwise: Joi.optional()
    })
    .messages({ 'any.invalid': 'ID approved_by tidak valid' }),
  paid_by: objectId
    .when('status', {
      is: 'Disetujui',
      then: Joi.required().messages({
        'any.required': 'paid_by wajib diisi saat Disetujui'
      }),
      otherwise: Joi.optional()
    })
    .messages({ 'any.invalid': 'ID paid_by tidak valid' }),

  details: Joi.array().items(detailSchema).min(1).required().messages({
    'array.base': 'Detail harus berupa array',
    'array.min': 'Minimal 1 detail keperluan',
    'any.required': 'Detail wajib diisi'
  }),

  // dikontrol backend → strip
  total_amount: Joi.any().strip(),
  request_status: Joi.any().strip(),
  voucher_number: Joi.any().strip(),
  payment_voucher: Joi.any().strip()
});

const updateExpenseRequestSchema = Joi.object({
  name: requesterField,

  project: objectId.messages({ 'any.invalid': 'ID proyek tidak valid' }),
  voucher_prefix: Joi.string().valid(...ER_PREFIXES),
  expense_type: Joi.string().valid(...ER_TYPES),
  submission_date: Joi.date().messages({
    'date.base': 'Tanggal pengajuan tidak valid'
  }),

  method: Joi.string().valid('Transfer', 'Tunai'),
  bank_account_number: Joi.string().when('method', {
    is: 'Transfer',
    then: Joi.required().messages({
      'any.required': 'Nomor rekening wajib diisi (Transfer)'
    }),
    otherwise: Joi.optional().allow(null, '')
  }),
  bank: Joi.string().when('method', {
    is: 'Transfer',
    then: Joi.required().messages({
      'any.required': 'Bank wajib diisi (Transfer)'
    }),
    otherwise: Joi.optional().allow(null, '')
  }),
  bank_branch: Joi.string().when('method', {
    is: 'Transfer',
    then: Joi.required().messages({
      'any.required': 'Cabang bank wajib diisi (Transfer)'
    }),
    otherwise: Joi.optional().allow(null, '')
  }),
  bank_account_holder: Joi.string().when('method', {
    is: 'Transfer',
    then: Joi.required().messages({
      'any.required': 'Pemilik rekening wajib diisi (Transfer)'
    }),
    otherwise: Joi.optional().allow(null, '')
  }),

  description: Joi.string().allow('', null),
  note: Joi.string()
    .allow('', null)
    .when('status', {
      is: 'Ditolak',
      then: Joi.required().messages({
        'any.required': 'Alasan penolakan wajib diisi'
      }),
      otherwise: Joi.optional()
    }),

  status: Joi.string().valid('Diproses', 'Disetujui', 'Ditolak'),
  approved_by: objectId
    .when('status', {
      is: 'Disetujui',
      then: Joi.required().messages({
        'any.required': 'approved_by wajib diisi saat Disetujui'
      }),
      otherwise: Joi.optional()
    })
    .messages({ 'any.invalid': 'ID approved_by tidak valid' }),
  paid_by: objectId.messages({ 'any.invalid': 'ID paid_by tidak valid' }),

  details: Joi.array().items(detailSchema).min(1),

  total_amount: Joi.any().strip(),
  request_status: Joi.any().strip(),
  voucher_number: Joi.any().strip(),
  payment_voucher: Joi.any().strip()
});

module.exports = {
  createExpenseRequestSchema,
  updateExpenseRequestSchema
};
