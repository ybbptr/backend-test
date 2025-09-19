const Joi = require('joi');
const mongoose = require('mongoose');

const objectId = Joi.string().custom((v, h) => {
  if (!mongoose.Types.ObjectId.isValid(v)) return h.error('any.invalid');
  return v;
}, 'ObjectId');

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
  amount: Joi.forbidden().messages({
    'any.unknown': 'Field amount dihitung otomatis'
  }),
  is_overbudget: Joi.forbidden().messages({
    'any.unknown': 'Field is_overbudget ditentukan sistem'
  })
});

/* ============ CREATE ============ */
const createExpenseRequestSchema = Joi.object({
  name: objectId
    .optional()
    .messages({ 'any.invalid': 'ID karyawan (name) tidak valid' }),

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

  submission_date: Joi.date().optional().messages({
    'date.base': 'Tanggal pengajuan tidak valid'
  }),

  method: Joi.string().valid('Transfer', 'Tunai').required().messages({
    'any.only': 'Metode pembayaran hanya boleh Transfer atau Tunai',
    'any.required': 'Metode pembayaran wajib diisi'
  }),
  bank_account_number: Joi.string().when('method', {
    is: 'Transfer',
    then: Joi.required().messages({
      'any.required': 'Nomor rekening wajib diisi (Transfer)'
    }),
    otherwise: Joi.allow(null, '')
  }),
  bank: Joi.string().when('method', {
    is: 'Transfer',
    then: Joi.required().messages({
      'any.required': 'Bank wajib diisi (Transfer)'
    }),
    otherwise: Joi.allow(null, '')
  }),
  bank_branch: Joi.string().when('method', {
    is: 'Transfer',
    then: Joi.required().messages({
      'any.required': 'Cabang bank wajib diisi (Transfer)'
    }),
    otherwise: Joi.allow(null, '')
  }),
  bank_account_holder: Joi.string().when('method', {
    is: 'Transfer',
    then: Joi.required().messages({
      'any.required': 'Pemilik rekening wajib diisi (Transfer)'
    }),
    otherwise: Joi.allow(null, '')
  }),

  description: Joi.string().allow('', null).messages({
    'string.base': 'Deskripsi harus berupa teks'
  }),

  details: Joi.array().items(detailSchema).min(1).required().messages({
    'array.base': 'Detail harus berupa array',
    'array.min': 'Minimal 1 item detail keperluan',
    'any.required': 'Detail wajib diisi'
  }),

  // dikontrol backend → dilarang dari FE
  status: Joi.forbidden().messages({
    'any.unknown': 'Status tidak boleh diisi dari klien'
  }),
  note: Joi.forbidden().messages({
    'any.unknown': 'Catatan penolakan hanya di endpoint Tolak'
  }),
  total_amount: Joi.forbidden().messages({
    'any.unknown': 'Total dihitung otomatis'
  }),
  request_status: Joi.forbidden().messages({
    'any.unknown': 'Request status ditentukan sistem'
  }),
  voucher_number: Joi.forbidden().messages({
    'any.unknown': 'Nomor voucher dibuat otomatis'
  }),
  payment_voucher: Joi.forbidden().messages({
    'any.unknown': 'Payment voucher dibuat otomatis'
  }),
  pv_locked: Joi.forbidden(),
  applied_bag_snapshot: Joi.forbidden(),
  over_budget: Joi.forbidden()
})
  .unknown(false)
  .messages({
    'object.unknown': 'Field {{#label}} tidak diperbolehkan'
  });

/* ============ UPDATE (edit saat Diproses / non-finansial saat Disetujui) ============ */
const updateExpenseRequestSchema = Joi.object({
  name: objectId
    .optional()
    .messages({ 'any.invalid': 'ID karyawan (name) tidak valid' }),

  expense_type: Joi.string()
    .valid(...ER_TYPES)
    .messages({
      'any.only': 'Jenis biaya tidak valid'
    }),

  method: Joi.string().valid('Transfer', 'Tunai').messages({
    'any.only': 'Metode pembayaran hanya boleh Transfer atau Tunai'
  }),
  bank_account_number: Joi.string().when('method', {
    is: 'Transfer',
    then: Joi.required().messages({
      'any.required': 'Nomor rekening wajib diisi (Transfer)'
    }),
    otherwise: Joi.allow(null, '')
  }),
  bank: Joi.string().when('method', {
    is: 'Transfer',
    then: Joi.required().messages({
      'any.required': 'Bank wajib diisi (Transfer)'
    }),
    otherwise: Joi.allow(null, '')
  }),
  bank_branch: Joi.string().when('method', {
    is: 'Transfer',
    then: Joi.required().messages({
      'any.required': 'Cabang bank wajib diisi (Transfer)'
    }),
    otherwise: Joi.allow(null, '')
  }),
  bank_account_holder: Joi.string().when('method', {
    is: 'Transfer',
    then: Joi.required().messages({
      'any.required': 'Pemilik rekening wajib diisi (Transfer)'
    }),
    otherwise: Joi.allow(null, '')
  }),

  description: Joi.string().allow('', null).messages({
    'string.base': 'Deskripsi harus berupa teks'
  }),

  details: Joi.array().items(detailSchema).min(1).messages({
    'array.base': 'Detail harus berupa array',
    'array.min': 'Minimal 1 item detail keperluan'
  }),

  // field yang dikunci
  project: Joi.forbidden().messages({
    'any.unknown': 'Project tidak boleh diubah'
  }),
  voucher_prefix: Joi.forbidden().messages({
    'any.unknown': 'Prefix voucher tidak boleh diubah'
  }),
  submission_date: Joi.forbidden(),
  status: Joi.forbidden().messages({
    'any.unknown': 'Status tidak boleh diubah lewat endpoint ini'
  }),
  note: Joi.forbidden().messages({
    'any.unknown': 'Catatan penolakan tidak diedit di sini'
  }),
  total_amount: Joi.forbidden(),
  request_status: Joi.forbidden(),
  voucher_number: Joi.forbidden(),
  payment_voucher: Joi.forbidden(),
  pv_locked: Joi.forbidden(),
  applied_bag_snapshot: Joi.forbidden(),
  over_budget: Joi.forbidden()
})
  .unknown(false)
  .messages({
    'object.unknown': 'Field {{#label}} tidak diperbolehkan'
  });

module.exports = {
  createExpenseRequestSchema,
  updateExpenseRequestSchema
};
