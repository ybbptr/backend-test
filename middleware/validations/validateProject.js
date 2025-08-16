const Joi = require('joi');
const mongoose = require('mongoose');

const projectSchema = Joi.object({
  project_name: Joi.string().required().messages({
    'string.base': 'Nama proyek harus berupa teks',
    'string.empty': 'Nama proyek tidak boleh kosong',
    'any.required': 'Nama proyek wajib diisi'
  }),

  location: Joi.string().required().messages({
    'string.base': 'Lokasi harus berupa teks',
    'string.empty': 'Lokasi tidak boleh kosong',
    'any.required': 'Lokasi wajib diisi'
  }),
  client: Joi.string()
    .custom((value, helpers) => {
      if (!mongoose.Types.ObjectId.isValid(value)) {
        return helpers.error('any.invalid');
      }
      return value;
    })
    .required()
    .messages({
      'string.base': 'Client harus berupa ID string',
      'any.invalid': 'ID client tidak valid',
      'any.required': 'Client wajib dipilih'
    }),

  start_date: Joi.date().required().messages({
    'date.base': 'Tanggal mulai tidak valid',
    'any.required': 'Tanggal mulai wajib diisi'
  }),

  end_date: Joi.date().allow(null).optional().messages({
    'date.base': 'Tanggal selesai tidak valid'
  }),

  progress: Joi.object({
    sondir: Joi.object({
      total_points: Joi.number().min(0).default(0).messages({
        'number.base': 'Total titik sondir harus berupa angka',
        'number.min': 'Total titik sondir tidak boleh negatif'
      }),
      completed_points: Joi.number().min(0).default(0).messages({
        'number.base': 'Titik selesai sondir harus berupa angka',
        'number.min': 'Titik selesai sondir tidak boleh negatif'
      }),
      max_depth: Joi.number().min(0).default(0).messages({
        'number.base': 'Kedalaman sondir harus berupa angka',
        'number.min': 'Kedalaman sondir tidak boleh negatif'
      })
    }).default(),

    bor: Joi.object({
      total_points: Joi.number().min(0).default(0).messages({
        'number.base': 'Total titik bor harus berupa angka',
        'number.min': 'Total titik bor tidak boleh negatif'
      }),
      completed_points: Joi.number().min(0).default(0).messages({
        'number.base': 'Titik selesai bor harus berupa angka',
        'number.min': 'Titik selesai bor tidak boleh negatif'
      }),
      max_depth: Joi.number().min(0).default(0).messages({
        'number.base': 'Kedalaman bor harus berupa angka',
        'number.min': 'Kedalaman bor tidak boleh negatif'
      })
    }).default(),

    cptu: Joi.object({
      total_points: Joi.number().min(0).default(0).messages({
        'number.base': 'Total titik CPTU harus berupa angka',
        'number.min': 'Total titik CPTU tidak boleh negatif'
      }),
      completed_points: Joi.number().min(0).default(0).messages({
        'number.base': 'Titik selesai CPTU harus berupa angka',
        'number.min': 'Titik selesai CPTU tidak boleh negatif'
      }),
      max_depth: Joi.number().min(0).default(0).messages({
        'number.base': 'Kedalaman CPTU harus berupa angka',
        'number.min': 'Kedalaman CPTU tidak boleh negatif'
      })
    }).default()
  }).default(),

  project_value: Joi.number().min(0).default(0).required().messages({
    'number.base': 'Nilai proyek harus berupa angka',
    'any.required': 'Nilai proyek harus diisi',
    'number.min': 'Nilai proyek tidak boleh negatif'
  }),

  max_expense: Joi.number().min(0).default(0).messages({
    'number.base': 'Pengeluaran maksimal harus berupa angka',
    'number.min': 'Pengeluaran maksimal tidak boleh negatif'
  }),

  proposed: Joi.number().min(0).default(0).messages({
    'number.base': 'Pengajuan harus berupa angka',
    'number.min': 'Pengajuan tidak boleh negatif'
  }),

  used: Joi.number().min(0).default(0).messages({
    'number.base': 'Pengeluaran yang digunakan harus berupa angka',
    'number.min': 'Pengeluaran yang digunakan tidak boleh negatif'
  }),

  remaining: Joi.number().min(0).default(0).messages({
    'number.base': 'Sisa pengeluaran harus berupa angka',
    'number.min': 'Sisa pengeluaran tidak boleh negatif'
  })
});

module.exports = projectSchema;
