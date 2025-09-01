const Joi = require('joi');

const loanSchema = Joi.object({
  borrower: Joi.string().required().messages({
    'any.required': 'Peminjam wajib diisi',
    'string.empty': 'Peminjam tidak boleh kosong'
  }),

  loan_date: Joi.date().required().messages({
    'any.required': 'Tanggal pinjam wajib diisi',
    'date.base': 'Tanggal pinjam harus berupa tanggal yang valid'
  }),

  return_date: Joi.date().greater(Joi.ref('loan_date')).required().messages({
    'any.required': 'Tanggal kembali wajib diisi',
    'date.base': 'Tanggal kembali harus berupa tanggal yang valid',
    'date.greater': 'Tanggal kembali harus lebih besar dari tanggal pinjam'
  }),

  nik: Joi.string().required().messages({
    'any.required': 'NIK wajib diisi',
    'string.empty': 'NIK tidak boleh kosong'
  }),

  address: Joi.string().required().messages({
    'any.required': 'Alamat wajib diisi',
    'string.empty': 'Alamat tidak boleh kosong'
  }),

  phone: Joi.string()
    .pattern(/^[0-9]+$/)
    .required()
    .messages({
      'any.required': 'Nomor HP wajib diisi',
      'string.empty': 'Nomor HP tidak boleh kosong',
      'string.pattern.base': 'Nomor HP hanya boleh berisi angka'
    }),

  borrowed_items: Joi.array()
    .items(
      Joi.object({
        product: Joi.string().required().messages({
          'any.required': 'ID produk wajib diisi'
        }),
        product_code: Joi.string().required().messages({
          'any.required': 'Kode barang wajib diisi'
        }),
        brand: Joi.string().allow('', null),
        quantity: Joi.number().min(1).required().messages({
          'any.required': 'Jumlah pinjam wajib diisi',
          'number.base': 'Jumlah pinjam harus berupa angka',
          'number.min': 'Jumlah pinjam minimal 1'
        }),
        pickup_date: Joi.date().required().messages({
          'any.required': 'Tanggal pengambilan wajib diisi',
          'date.base': 'Tanggal pengambilan harus berupa tanggal'
        }),
        return_date: Joi.date().allow(null),
        project: Joi.string().allow(null),
        condition: Joi.string().allow('', null)
      })
    )
    .min(1)
    .required()
    .messages({
      'array.min': 'Minimal harus ada 1 barang yang dipinjam',
      'any.required': 'Barang yang dipinjam wajib diisi'
    }),

  approval: Joi.string()
    .valid('Disetujui', 'Ditolak', 'Diproses')
    .default('Diproses')
    .messages({
      'any.only':
        'Status approval hanya boleh Disetujui, Ditolak, atau Diproses'
    })
});

module.exports = {
  loanSchema
};
