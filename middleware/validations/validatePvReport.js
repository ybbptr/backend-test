const Joi = require('joi');
const mongoose = require('mongoose');

// validator untuk ObjectId
const objectIdValidator = (value, helpers) => {
  if (!mongoose.Types.ObjectId.isValid(value)) {
    return helpers.error('any.invalid');
  }
  return value;
};

// schema untuk item
const pvItemSchema = Joi.object({
  purpose: Joi.string().messages({
    'any.required': 'Tujuan wajib diisi',
    'string.base': 'Tujuan harus berupa teks',
    'string.empty': 'Tujuan tidak boleh kosong'
  }),
  category: Joi.string().messages({
    'any.required': 'Kategori wajib diisi',
    'string.base': 'Kategori harus berupa teks',
    'string.empty': 'Kategori tidak boleh kosong'
  }),
  quantity: Joi.number().min(1).messages({
    'any.required': 'Jumlah wajib diisi',
    'number.base': 'Jumlah harus berupa angka',
    'number.min': 'Jumlah minimal 1'
  }),
  unit_price: Joi.number().min(0).messages({
    'any.required': 'Harga satuan wajib diisi',
    'number.base': 'Harga satuan harus berupa angka',
    'number.min': 'Harga satuan minimal 0'
  }),
  amount: Joi.number().min(0).messages({
    'any.required': 'Jumlah total wajib diisi',
    'number.base': 'Jumlah total harus berupa angka',
    'number.min': 'Jumlah total minimal 0'
  }),
  aktual: Joi.number().min(0).default(0).messages({
    'number.base': 'Aktual harus berupa angka',
    'number.min': 'Aktual minimal 0'
  }),
  nota: Joi.object({
    key: Joi.string().allow(null, ''),
    contentType: Joi.string().allow(null, ''),
    size: Joi.number().allow(null),
    uploadedAt: Joi.date().allow(null)
  }).optional()
});

// schema untuk header + items
const pvReportSchema = Joi.object({
  pv_number: Joi.string().required().messages({
    'any.required': 'Nomor PV wajib diisi',
    'string.empty': 'Nomor PV tidak boleh kosong'
  }),
  voucher_number: Joi.string().required().messages({
    'any.required': 'Nomor voucher wajib diisi',
    'string.empty': 'Nomor voucher tidak boleh kosong'
  }),
  report_date: Joi.date().required().messages({
    'any.required': 'Tanggal laporan wajib diisi',
    'date.base': 'Tanggal laporan tidak valid'
  }),
  project: Joi.string().custom(objectIdValidator).messages({
    'any.invalid': 'ID proyek tidak valid',
    'string.empty': 'Proyek tidak boleh kosong'
  }),

  created_by: Joi.string().custom(objectIdValidator).messages({
    'any.invalid': 'ID pembuat laporan tidak valid',
    'string.empty': 'Pembuat laporan tidak boleh kosong'
  }),
  approved_by: Joi.string().custom(objectIdValidator).allow(null, '').messages({
    'any.invalid': 'ID penyetuju tidak valid'
  }),
  recipient: Joi.string().custom(objectIdValidator).allow(null, '').messages({
    'any.invalid': 'ID penerima tidak valid'
  }),

  status: Joi.string()
    .valid('Diproses', 'Ditolak', 'Disetujui')
    .default('Diproses')
    .messages({
      'any.only':
        'Status harus salah satu dari: Diproses, Ditolak, atau Disetujui'
    }),

  items: Joi.array().items(pvItemSchema).min(1).required().messages({
    'array.base': 'Daftar item harus berupa array',
    'array.min': 'Minimal 1 item harus diisi',
    'any.required': 'Item wajib diisi'
  })
});

module.exports = { pvReportSchema };
