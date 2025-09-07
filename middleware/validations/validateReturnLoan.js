const Joi = require('joi');
const mongoose = require('mongoose');

const objectId = (label) =>
  Joi.string()
    .custom((value, helpers) => {
      if (!mongoose.Types.ObjectId.isValid(value)) {
        return helpers.error('any.invalid');
      }
      return value;
    })
    .messages({
      'any.invalid': `${label} tidak valid!`
    });

const validateReturnedItem = Joi.object({
  product: objectId('ID barang'),
  product_code: Joi.string().messages({
    'any.required': 'Kode barang wajib diisi'
  }),
  brand: Joi.string().messages({
    'any.required': 'Merek wajib diisi'
  }),
  quantity: Joi.number().integer().min(1).messages({
    'number.base': 'Jumlah harus berupa angka',
    'number.integer': 'Jumlah harus bilangan bulat',
    'number.min': 'Jumlah minimal 1',
    'any.required': 'Jumlah wajib diisi'
  }),
  warehouse_return: objectId('ID gudang pengembalian'),
  shelf_return: objectId('ID lemari pengembalian').optional().allow(null),
  condition_new: Joi.string().valid('Baik', 'Rusak', 'Maintenance').required(),
  project: objectId('ID proyek').optional().allow(null),
  proof_image: Joi.object({
    key: Joi.string().required(),
    contentType: Joi.string().optional(),
    size: Joi.number().optional(),
    uploadedAt: Joi.date().optional()
  }).optional()
});

const validateReturnLoan = Joi.object({
  loan_number: Joi.string().required(),
  borrower: Joi.string().required(),
  position: Joi.string().required(),
  report_date: Joi.date().required(),
  return_date: Joi.date().required(),
  inventory_manager: Joi.string()
    .valid('Owan H.', 'Teguh F.', 'Korlap')
    .messages({
      'any.only': 'Penanggung jawab hanya Owan H., Teguh F., dan Korlap'
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
});

module.exports = { validateReturnLoan };
