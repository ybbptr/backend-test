const Joi = require('joi');
const mongoose = require('mongoose');

const objectIdValidator = (value, helpers) => {
  if (!mongoose.Types.ObjectId.isValid(value)) {
    return helpers.error('any.invalid');
  }
  return value;
};

const biayaSchema = Joi.object({
  jumlah: Joi.number().min(0).required().messages({
    'number.base': 'Jumlah harus berupa angka',
    'number.min': 'Jumlah minimal 0'
  }),
  aktual: Joi.number().min(0).required().messages({
    'number.base': 'Aktual harus berupa angka',
    'number.min': 'Aktual minimal 0'
  })
});

const createRAPSchema = Joi.object({
  project_name: Joi.string().required().messages({
    'string.base': 'Nama proyek harus berupa teks',
    'any.required': 'Nama proyek wajib diisi'
  }),
  client: Joi.string().custom(objectIdValidator).required().messages({
    'any.invalid': 'ID client tidak valid!',
    'any.required': 'Client wajib dipilih!'
  }),
  nomor_kontrak: Joi.string().required().messages({
    'string.base': 'Nomor kontrak harus berupa teks',
    'any.required': 'Nomor kontrak wajib diisi'
  }),
  nilai_pekerjaan: Joi.number().min(1).required().messages({
    'number.base': 'Nilai pekerjaan harus berupa angka',
    'number.min': 'Nilai pekerjaan minimal 1',
    'any.required': 'Nilai pekerjaan wajib diisi'
  }),
  name: Joi.string().required().messages({
    'string.base': 'Nama klien harus berupa teks',
    'any.required': 'Nama klien wajib diisi'
  }),
  phone: Joi.string().required().messages({
    'string.base': 'Masukkan nomor telp yang valid',
    'any.required': 'Kontak wajib diisi!'
  }),
  address: Joi.string().required().messages({
    'string.base': 'Alamat harus berupa teks',
    'any.required': 'Kontak wajib diisi!'
  }),
  date_start: Joi.date().required().messages({
    'date.base': 'Tanggal mulai tidak valid',
    'any.required': 'Tanggal mulai wajib diisi'
  }),

  date_end: Joi.date().allow(null).optional().messages({
    'date.base': 'Tanggal selesai tidak valid'
  }),
  npwp: Joi.string().required().messages({
    'string.base': 'Nomor NPWP tidak valid',
    'any.required': 'Kontak wajib diisi!'
  }),
  location: Joi.string().required().messages({
    'string.base': 'Lokasi harus berupa teks',
    'any.required': 'Lokasi wajib dipilih'
  }),

  nilai_pekerjaan_addendum: Joi.number().min(0).optional(),
  nomor_kontrak_addendum: Joi.string().optional(),
  nilai_fix_pekerjaan: Joi.number().min(0).optional(),
  persiapan_pekerjaan: Joi.object().optional(),
  operasional_lapangan: Joi.object().optional(),
  operasional_tenaga_ahli: Joi.object().optional(),
  sewa_alat: Joi.object().optional(),
  operasional_lab: Joi.object().optional(),
  pajak: Joi.object().optional(),
  biaya_lain_lain: Joi.object().optional()
});

const updateRAPSchema = Joi.object({
  project_name: Joi.string().messages({
    'string.base': 'Nama proyek harus berupa teks'
  }),
  nomor_kontrak: Joi.string().messages({
    'string.base': 'Nomor kontrak harus berupa teks'
  }),
  client: Joi.string().custom(objectIdValidator).messages({
    'any.invalid': 'ID client tidak valid!'
  }),
  name: Joi.string().messages({
    'string.base': 'Nama klien harus berupa teks'
  }),
  phone: Joi.string().messages({
    'string.base': 'Masukkan nomor telp yang valid'
  }),
  address: Joi.string().messages({
    'string.base': 'Alamat harus berupa teks'
  }),
  npwp: Joi.string().messages({
    'string.base': 'Nomor NPWP tidak valid'
  }),
  location: Joi.string().messages({
    'string.base': 'Lokasi harus berupa teks'
  }),
  nilai_pekerjaan: Joi.number().min(1).messages({
    'number.base': 'Nilai pekerjaan harus berupa angka',
    'number.min': 'Nilai pekerjaan minimal 1'
  }),
  nilai_pekerjaan_addendum: Joi.number().min(0).optional(),
  nomor_kontrak_addendum: Joi.string().optional(),
  date_start: Joi.date().messages({
    'date.base': 'Tanggal mulai tidak valid'
  }),

  date_end: Joi.date().allow(null).optional().messages({
    'date.base': 'Tanggal selesai tidak valid'
  }),
  nilai_fix_pekerjaan: Joi.number().min(0).optional(),
  persiapan_pekerjaan: Joi.object().optional(),
  operasional_lapangan: Joi.object().optional(),
  operasional_tenaga_ahli: Joi.object().optional(),
  sewa_alat: Joi.object().optional(),
  operasional_lab: Joi.object().optional(),
  pajak: Joi.object().optional(),
  biaya_lain_lain: Joi.object().optional()
});

module.exports = {
  createRAPSchema,
  updateRAPSchema
};
