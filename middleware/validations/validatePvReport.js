// middleware/validations/validatePvReport.js
const Joi = require('joi');
const mongoose = require('mongoose');

const objectId = Joi.string().custom((value, helpers) => {
  if (!mongoose.Types.ObjectId.isValid(value))
    return helpers.error('any.invalid');
  return value;
}, 'ObjectId validator');

const nonNeg = Joi.number().min(0);

// Item saat CREATE: FE kirim er_detail_id + aktual
const pvItemCreateSchema = Joi.object({
  er_detail_id: objectId.required().messages({
    'any.required': 'er_detail_id wajib diisi',
    'any.invalid': 'er_detail_id tidak valid'
  }),
  aktual: nonNeg.required().messages({
    'number.base': 'Aktual harus berupa angka',
    'number.min': 'Aktual minimal 0',
    'any.required': 'Aktual wajib diisi'
  })
});

// Item saat UPDATE (Diproses): refer ke item yang sudah ada
const pvItemUpdateSchema = Joi.object({
  er_detail_id: objectId.required().messages({
    'any.required': 'er_detail_id wajib diisi',
    'any.invalid': 'er_detail_id tidak valid'
  }),
  aktual: nonNeg.optional().messages({
    'number.base': 'Aktual harus berupa angka',
    'number.min': 'Aktual minimal 0'
  })
});

// Parser items: terima string JSON atau array
function itemsParser(itemSchema) {
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
      .items(itemSchema)
      .validate(arr, { abortEarly: false, stripUnknown: true });
    if (error) return helpers.error('any.invalid', { message: error.message });
    return validated;
  }, 'items parser + validator');
}

// Admin boleh supply created_by; non-admin di-strip
const createdByField = Joi.alternatives().conditional('$role', {
  is: 'admin',
  then: objectId.optional().messages({
    'any.invalid': 'ID pembuat tidak valid',
    'string.empty': 'Pembuat tidak boleh kosong'
  }),
  otherwise: Joi.any().strip()
});

// CREATE
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
  report_date: Joi.date().optional().messages({
    'date.base': 'Tanggal laporan tidak valid'
  }),
  created_by: createdByField,
  items: itemsParser(pvItemCreateSchema).required(),

  // dikontrol backend
  project: Joi.any().strip(),
  status: Joi.any().strip(),
  note: Joi.any().strip(),
  total_amount: Joi.any().strip(),
  total_aktual: Joi.any().strip(),
  remaining: Joi.any().strip(),
  has_overbudget: Joi.any().strip()
});

// UPDATE
const updatePVReportSchema = Joi.object({
  report_date: Joi.date().optional().messages({
    'date.base': 'Tanggal laporan tidak valid'
  }),
  items: itemsParser(pvItemUpdateSchema).optional(),

  // tidak boleh diubah langsung
  pv_number: Joi.any().strip(),
  voucher_number: Joi.any().strip(),
  project: Joi.any().strip(),
  created_by: Joi.any().strip(),
  status: Joi.any().strip(),
  note: Joi.any().strip(),
  total_amount: Joi.any().strip(),
  total_aktual: Joi.any().strip(),
  remaining: Joi.any().strip(),
  has_overbudget: Joi.any().strip()
});

module.exports = {
  createPVReportSchema,
  updatePVReportSchema
};
