const Joi = require('joi');

const biayaSchema = Joi.object({
  jumlah: Joi.number().min(0).required().messages({
    'number.base': 'Jumlah harus berupa angka',
    'number.min': 'Jumlah minimal 0',
    'any.required': 'Jumlah wajib diisi'
  }),
  aktual: Joi.number().min(0).required().messages({
    'number.base': 'Aktual harus berupa angka',
    'number.min': 'Aktual minimal 0',
    'any.required': 'Aktual wajib diisi'
  })
});

const createRAPSchema = Joi.object({
  project_name: Joi.string().required().messages({
    'string.base': 'Nama proyek harus berupa teks',
    'any.required': 'Nama proyek wajib diisi'
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
  client: Joi.string().required().messages({
    'string.base': 'Client harus berupa ObjectId',
    'any.required': 'Client wajib dipilih'
  }),

  nilai_pekerjaan_addendum: Joi.number().min(0).optional(),
  nomor_kontrak_addendum: Joi.string().optional(),
  nilai_fix_pekerjaan: Joi.number().min(0).optional()
});

const updateRAPSchema = Joi.object({
  project_name: Joi.string().messages({
    'string.base': 'Nama proyek harus berupa teks'
  }),
  nomor_kontrak: Joi.string().messages({
    'string.base': 'Nomor kontrak harus berupa teks'
  }),
  nilai_pekerjaan: Joi.number().min(1).messages({
    'number.base': 'Nilai pekerjaan harus berupa angka',
    'number.min': 'Nilai pekerjaan minimal 1'
  }),
  client: Joi.string().messages({
    'string.base': 'Client harus berupa ObjectId'
  }),
  nilai_pekerjaan_addendum: Joi.number().min(0).optional(),
  nomor_kontrak_addendum: Joi.string().optional(),
  nilai_fix_pekerjaan: Joi.number().min(0).optional()
})
  .min(1)
  .messages({
    'object.min': 'Minimal harus ada 1 field yang diupdate'
  });

module.exports = {
  createRAPSchema,
  updateRAPSchema
};
