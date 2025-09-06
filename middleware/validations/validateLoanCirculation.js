const Joi = require('joi');
const mongoose = require('mongoose');

const objectIdValidator = (value, helpers) => {
  if (!mongoose.Types.ObjectId.isValid(value)) {
    return helpers.error('any.invalid');
  }
  return value;
};

const validateBorrowedItem = Joi.object({
  product: Joi.string().custom(objectIdValidator).required().messages({
    'any.invalid': 'ID barang tidak valid!',
    'any.required': 'Barang wajib diisi!'
  }),
  product_code: Joi.string().required().messages({
    'any.required': 'Kode produk wajib diisi'
  }),
  brand: Joi.string().required().messages({
    'any.required': 'Merek produk wajib diisi'
  }),
  quantity: Joi.number().integer().min(1).required().messages({
    'number.base': 'Jumlah harus berupa angka',
    'number.integer': 'Jumlah harus bilangan bulat',
    'number.min': 'Jumlah minimal 1',
    'any.required': 'Jumlah wajib diisi'
  }),
  project: Joi.string().custom(objectIdValidator).optional().allow(null),
  condition: Joi.string().valid('Baik', 'Rusak', 'Maintenance').optional(),
  warehouse_from: Joi.string().custom(objectIdValidator).required(),
  shelf_from: Joi.string().custom(objectIdValidator).optional(),
  product_image: Joi.string().optional().allow(''),
  item_status: Joi.string()
    .valid('Dipinjam', 'Dikembalikan')
    .default('Dipinjam'),
  loan_date_circulation: Joi.date().optional(),
  return_date_circulation: Joi.date().optional().allow(null)
});

const validateLoanCirculation = Joi.object({
  loan_number: Joi.string().required(),
  borrower: Joi.string().custom(objectIdValidator).required(),
  phone: Joi.string().required(),
  inventory_manager: Joi.string().custom(objectIdValidator).required(),
  warehouse_to: Joi.string().custom(objectIdValidator).required(),
  shelf_to: Joi.string().custom(objectIdValidator).optional(),
  loan_date_circulation: Joi.date().required(),
  borrowed_items: Joi.array().items(validateBorrowedItem).min(1).required()
});

module.exports = { validateLoanCirculation };
