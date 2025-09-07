const Joi = require('joi');
const mongoose = require('mongoose');

// helper validasi ObjectId
const objectId = (label) =>
  Joi.string()
    .custom((value, helpers) => {
      if (!mongoose.Types.ObjectId.isValid(value)) {
        return helpers.error('any.invalid');
      }
      return value;
    })
    .messages({
      'any.invalid': `${label} tidak valid!`,
      'string.base': `${label} harus berupa string`,
      'string.empty': `${label} tidak boleh kosong`
    });

const validateReturnedItem = Joi.object({
  product: objectId('ID barang').required().messages({
    'any.required': 'ID barang wajib diisi'
  }),
  product_code: Joi.string().required().messages({
    'string.base': 'Kode barang harus berupa teks',
    'string.empty': 'Kode barang tidak boleh kosong',
    'any.required': 'Kode barang wajib diisi'
  }),
  brand: Joi.string().required().messages({
    'string.base': 'Merek harus berupa teks',
    'string.empty': 'Merek tidak boleh kosong',
    'any.required': 'Merek wajib diisi'
  }),
  quantity: Joi.number().integer().min(1).required().messages({
    'number.base': 'Jumlah harus berupa angka',
    'number.integer': 'Jumlah harus bilangan bulat',
    'number.min': 'Jumlah minimal 1',
    'any.required': 'Jumlah wajib diisi'
  }),
  warehouse_return: objectId('ID gudang pengembalian')
    .allow(null, '')
    .messages({
      'any.required': 'ID gudang pengembalian wajib diisi'
    }),
  shelf_return: objectId('ID lemari pengembalian')
    .optional()
    .allow(null, '')
    .messages({
      'any.required': 'ID lemari pengembalian wajib diisi'
    }),
  condition_new: Joi.string()
    .valid('Baik', 'Rusak', 'Maintenance', 'Hilang')
    .required()
    .messages({
      'any.only':
        'Kondisi barang hanya boleh: Baik, Rusak, Maintenance, atau Hilang',
      'string.base': 'Kondisi barang harus berupa teks',
      'string.empty': 'Kondisi barang tidak boleh kosong',
      'any.required': 'Kondisi barang wajib diisi'
    }),
  project: objectId('ID proyek').optional().allow(null, '').messages({
    'any.required': 'ID proyek wajib diisi bila ada'
  }),
  proof_image: Joi.object({
    key: Joi.string().required().messages({
      'string.base': 'Key bukti harus berupa teks',
      'string.empty': 'Key bukti tidak boleh kosong',
      'any.required': 'Key bukti wajib diisi'
    }),
    contentType: Joi.string().optional().messages({
      'string.base': 'Content type bukti harus berupa teks'
    }),
    size: Joi.number().optional().messages({
      'number.base': 'Ukuran bukti harus berupa angka'
    }),
    uploadedAt: Joi.date().optional().messages({
      'date.base': 'Tanggal upload bukti harus berupa tanggal yang valid'
    })
  }).optional()
});

const validateReturnLoan = Joi.object({
  loan_number: Joi.string().required().messages({
    'string.base': 'Nomor peminjaman harus berupa teks',
    'string.empty': 'Nomor peminjaman tidak boleh kosong',
    'any.required': 'Nomor peminjaman wajib diisi'
  }),
  borrower: objectId('ID barang').required().messages({
    'any.required': 'ID barang wajib diisi'
  }),
  position: Joi.string().required().messages({
    'string.base': 'Jabatan harus berupa teks',
    'string.empty': 'Jabatan tidak boleh kosong',
    'any.required': 'Jabatan wajib diisi'
  }),
  report_date: Joi.date().required().messages({
    'date.base': 'Tanggal laporan harus berupa tanggal valid',
    'any.required': 'Tanggal laporan wajib diisi'
  }),
  return_date: Joi.date().required().messages({
    'date.base': 'Tanggal pengembalian harus berupa tanggal valid',
    'any.required': 'Tanggal pengembalian wajib diisi'
  }),
  inventory_manager: Joi.string()
    .valid('Owan H.', 'Teguh F.', 'Korlap')
    .required()
    .messages({
      'any.only': 'Penanggung jawab hanya boleh Owan H., Teguh F., atau Korlap',
      'string.base': 'Penanggung jawab harus berupa teks',
      'string.empty': 'Penanggung jawab tidak boleh kosong',
      'any.required': 'Penanggung jawab wajib diisi'
    }),
  returned_items: Joi.alternatives()
    .try(
      Joi.array().items(validateReturnedItem),
      Joi.string().custom((value, helpers) => {
        try {
          const parsed = JSON.parse(value);
          if (!Array.isArray(parsed)) throw new Error();
          return parsed;
        } catch (err) {
          return helpers.error('any.invalid');
        }
      })
    )
    .required()
    .messages({
      'any.required': 'Daftar barang pengembalian wajib diisi',
      'any.invalid': 'Format returned_items harus berupa array JSON yang valid',
      'array.base': 'returned_items harus berupa array'
    })
});

module.exports = { validateReturnLoan };
