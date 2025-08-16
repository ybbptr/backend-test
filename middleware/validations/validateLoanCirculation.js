const Joi = require('joi');

const validateLoanCirculation = Joi.object({
  product: Joi.string()
    .custom((value, helpers) => {
      if (!mongoose.Types.ObjectId.isValid(value)) {
        return helpers.error('any.invalid');
      }
      return value;
    })
    .required()
    .messages({
      'any.invalid': 'ID barang tidak valid!',
      'any.required': 'Barang wajib diisi!'
    }),
  product_name: Joi.string().required().messages({
    'string.base': 'Nama produk harus berupa teks',
    'any.required': 'Nama produk wajib diisi'
  }),
  loan_quantity: Joi.number().integer().min(0).required().messages({
    'number.base': 'Jumlah peminjaman harus berupa angka',
    'number.integer': 'Jumlah peminjaman harus bilangan bulat',
    'number.min': 'Jumlah peminjaman minimal 0',
    'any.required': 'Jumlah peminjaman wajib diisi'
  }),
  warehouse_from: Joi.string().required().messages({
    'string.base': 'Gudang asal harus berupa teks',
    'any.required': 'Gudang asal wajib diisi'
  }),
  warehouse_to: Joi.string().required().messages({
    'string.base': 'Gudang tujuan harus berupa teks',
    'any.required': 'Gudang tujuan wajib diisi'
  }),
  imageUrl: Joi.string().uri().optional().allow('').messages({
    'string.uri': 'URL gambar tidak valid'
  })
});

module.exports = validateLoanCirculation;
