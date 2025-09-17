const Joi = require('joi');
const mongoose = require('mongoose');

const objectId = Joi.string().custom((value, helpers) => {
  if (!mongoose.Types.ObjectId.isValid(value))
    return helpers.error('any.invalid');
  return value;
}, 'ObjectId validator');

const nonNeg = Joi.number().min(0);

const pvItemSchema = Joi.object({
  purpose: Joi.string().required().messages({
    'string.base': 'Tujuan harus berupa teks',
    'string.empty': 'Tujuan tidak boleh kosong',
    'any.required': 'Tujuan wajib diisi'
  }),
  category: Joi.string().required().messages({
    'string.base': 'Kategori harus berupa teks',
    'string.empty': 'Kategori tidak boleh kosong',
    'any.required': 'Kategori wajib diisi'
  }),
  quantity: Joi.number().integer().min(1).required().messages({
    'number.base': 'Jumlah harus berupa angka',
    'number.integer': 'Jumlah harus bilangan bulat',
    'number.min': 'Jumlah minimal 1',
    'any.required': 'Jumlah wajib diisi'
  }),
  unit_price: nonNeg.required().messages({
    'number.base': 'Harga satuan harus berupa angka',
    'number.min': 'Harga satuan minimal 0',
    'any.required': 'Harga satuan wajib diisi'
  }),
  amount: nonNeg.required().messages({
    'number.base': 'Jumlah total harus berupa angka',
    'number.min': 'Jumlah total minimal 0',
    'any.required': 'Jumlah total wajib diisi'
  }),
  aktual: nonNeg.default(0).messages({
    'number.base': 'Aktual harus berupa angka',
    'number.min': 'Aktual minimal 0'
  }),
  nota: Joi.any().optional()
}).custom((val, helpers) => {
  const q = Number(val.quantity);
  const p = Number(val.unit_price);
  const a = Number(val.amount);
  if (Number.isFinite(q) && Number.isFinite(p) && Number.isFinite(a)) {
    const calc = Math.round(q * p * 100) / 100;
    if (Math.abs(calc - a) > 0.01) {
      return helpers.error('any.custom', {
        message: 'amount harus = quantity × unit_price'
      });
    }
  }
  return val;
}, 'PV item consistency');

// Terima array items atau string JSON
function itemsParser() {
  return Joi.any().custom((value, helpers) => {
    let arr = value;
    if (typeof value === 'string') {
      try {
        arr = JSON.parse(value);
      } catch {
        return helpers.error('any.invalid', {
          message: 'items harus JSON array yang valid'
        });
      }
    }
    if (!Array.isArray(arr))
      return helpers.error('array.base', {
        message: 'items harus berupa array'
      });
    if (arr.length < 1)
      return helpers.error('array.min', {
        message: 'Minimal 1 item harus diisi'
      });

    const { error, value: validated } = Joi.array()
      .items(pvItemSchema)
      .validate(arr, {
        abortEarly: false,
        stripUnknown: true
      });
    if (error) return helpers.error('any.invalid', { message: error.message });
    return validated;
  }, 'items parser + validator');
}

// Admin boleh supply "created_by". Non-admin: strip.
const createdByField = Joi.alternatives().conditional('$role', {
  is: 'admin',
  then: objectId
    .optional()
    .messages({ 'any.invalid': 'ID pembuat tidak valid' }),
  otherwise: Joi.any().strip()
});

const createPVReportSchema = Joi.object({
  pv_number: Joi.string().required().messages({
    'string.base': 'Nomor PV harus berupa teks',
    'string.empty': 'Nomor PV tidak boleh kosong',
    'any.required': 'Nomor PV wajib diisi'
  }),
  voucher_number: Joi.string().required().messages({
    'string.base': 'Nomor voucher harus berupa teks',
    'string.empty': 'Nomor voucher tidak boleh kosong',
    'any.required': 'Nomor voucher wajib diisi'
  }),
  report_date: Joi.date().default(Date.now).messages({
    'date.base': 'Tanggal laporan tidak valid'
  }),

  created_by: createdByField,
  approved_by: objectId
    .when('status', {
      is: 'Disetujui',
      then: Joi.required().messages({
        'any.required': 'approved_by wajib diisi saat Disetujui'
      }),
      otherwise: Joi.optional()
    })
    .messages({ 'any.invalid': 'ID penyetuju tidak valid' }),
  recipient: objectId
    .allow(null, '')
    .messages({ 'any.invalid': 'ID penerima tidak valid' }),

  status: Joi.string()
    .valid('Diproses', 'Ditolak', 'Disetujui')
    .default('Diproses')
    .messages({ 'any.only': 'Status harus Diproses/Ditolak/Disetujui' }),
  note: Joi.string()
    .allow('', null)
    .when('status', {
      is: 'Ditolak',
      then: Joi.required().messages({
        'any.required': 'Catatan wajib diisi saat Ditolak'
      }),
      otherwise: Joi.optional()
    }),

  items: itemsParser().required(),

  // Dikontrol backend
  project: Joi.any().strip(),
  total_amount: Joi.any().strip(),
  total_aktual: Joi.any().strip(),
  remaining: Joi.any().strip(),
  has_overbudget: Joi.any().strip()
});

const updatePVReportSchema = Joi.object({
  report_date: Joi.date().messages({
    'date.base': 'Tanggal laporan tidak valid'
  }),
  status: Joi.string()
    .valid('Diproses', 'Ditolak', 'Disetujui')
    .messages({ 'any.only': 'Status harus Diproses/Ditolak/Disetujui' }),
  approved_by: objectId
    .when('status', {
      is: 'Disetujui',
      then: Joi.required().messages({
        'any.required': 'approved_by wajib diisi saat Disetujui'
      }),
      otherwise: Joi.optional()
    })
    .messages({ 'any.invalid': 'ID penyetuju tidak valid' }),
  recipient: objectId
    .allow(null, '')
    .messages({ 'any.invalid': 'ID penerima tidak valid' }),
  note: Joi.string()
    .allow('', null)
    .when('status', {
      is: 'Ditolak',
      then: Joi.required().messages({
        'any.required': 'Catatan wajib diisi saat Ditolak'
      }),
      otherwise: Joi.optional()
    }),

  items: itemsParser(),

  // tidak boleh diubah langsung
  pv_number: Joi.any().strip(),
  voucher_number: Joi.any().strip(),
  project: Joi.any().strip(),
  created_by: Joi.any().strip(),
  total_amount: Joi.any().strip(),
  total_aktual: Joi.any().strip(),
  remaining: Joi.any().strip(),
  has_overbudget: Joi.any().strip()
});

module.exports = {
  createPVReportSchema,
  updatePVReportSchema
};
