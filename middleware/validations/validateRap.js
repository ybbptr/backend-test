// validators/rap.schema.js
const Joi = require('joi');
const mongoose = require('mongoose');

const objectId = Joi.string().custom((value, helpers) => {
  if (!mongoose.Types.ObjectId.isValid(value))
    return helpers.error('any.invalid');
  return value;
}, 'ObjectId validator');

const nonNeg = Joi.number().min(0);

// item biaya per kategori RAP
const biayaItem = Joi.object({
  jumlah: nonNeg.required().messages({
    'number.base': 'Jumlah harus berupa angka',
    'number.min': 'Jumlah minimal 0',
    'any.required': 'Jumlah wajib diisi'
  }),
  // boleh dikirim (mis. import), tapi biasanya 0 saat create
  biaya_pengajuan: nonNeg.default(0),
  aktual: nonNeg.default(0),
  // backend akan hitung ulang; kalau dikirim → diabaikan
  is_overbudget: Joi.any().strip()
});

// group biaya: objek dinamis { kategori: biayaItem }
const biayaGroup = Joi.object().pattern(/.*/, biayaItem);

const createRAPSchema = Joi.object({
  project_name: Joi.string().required().messages({
    'string.base': 'Nama proyek harus berupa teks',
    'any.required': 'Nama proyek wajib diisi'
  }),
  client: objectId.required().messages({
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
    'any.required': 'Alamat wajib diisi!'
  }),
  date_start: Joi.date().required().messages({
    'date.base': 'Tanggal mulai tidak valid',
    'any.required': 'Tanggal mulai wajib diisi'
  }),
  date_end: Joi.date().allow(null).min(Joi.ref('date_start')).messages({
    'date.base': 'Tanggal selesai tidak valid',
    'date.min': 'Tanggal selesai tidak boleh sebelum tanggal mulai'
  }),
  npwp: Joi.string().required().messages({
    'string.base': 'Nomor NPWP tidak valid',
    'any.required': 'NPWP wajib diisi!'
  }),
  location: Joi.string().required().messages({
    'string.base': 'Lokasi harus berupa teks',
    'any.required': 'Lokasi wajib dipilih'
  }),
  nilai_pekerjaan_addendum: nonNeg.optional(),
  nomor_kontrak_addendum: Joi.string().optional(),
  nilai_fix_pekerjaan: nonNeg.optional(),

  // Struktur biaya (opsional saat create)
  persiapan_pekerjaan: biayaGroup.optional(),
  operasional_lapangan: biayaGroup.optional(),
  operasional_tenaga_ahli: biayaGroup.optional(),
  sewa_alat: biayaGroup.optional(),
  operasional_lab: biayaGroup.optional(),
  pajak: biayaGroup.optional(),
  biaya_lain_lain: biayaGroup.optional()
});

const updateRAPSchema = Joi.object({
  project_name: Joi.string(),
  nomor_kontrak: Joi.string(),
  client: objectId.messages({ 'any.invalid': 'ID client tidak valid!' }),
  name: Joi.string(),
  phone: Joi.string(),
  address: Joi.string(),
  npwp: Joi.string(),
  location: Joi.string(),
  nilai_pekerjaan: Joi.number().min(1),
  nilai_pekerjaan_addendum: nonNeg.optional(),
  nomor_kontrak_addendum: Joi.string().optional(),
  date_start: Joi.date().messages({ 'date.base': 'Tanggal mulai tidak valid' }),
  date_end: Joi.date().allow(null).min(Joi.ref('date_start')).messages({
    'date.base': 'Tanggal selesai tidak valid',
    'date.min': 'Tanggal selesai tidak boleh sebelum tanggal mulai'
  }),
  nilai_fix_pekerjaan: nonNeg.optional(),

  // Struktur biaya (boleh parsial)
  persiapan_pekerjaan: biayaGroup.optional(),
  operasional_lapangan: biayaGroup.optional(),
  operasional_tenaga_ahli: biayaGroup.optional(),
  sewa_alat: biayaGroup.optional(),
  operasional_lab: biayaGroup.optional(),
  pajak: biayaGroup.optional(),
  biaya_lain_lain: biayaGroup.optional()
});

module.exports = {
  createRAPSchema,
  updateRAPSchema
};
