// models/Product.js
const mongoose = require('mongoose');

const productSchema = new mongoose.Schema(
  {
    product_code: {
      type: String,
      unique: true,
      required: true,
      trim: true
    },

    category: {
      type: String,
      trim: true,
      required: true,
      enum: [
        'Bor',
        'CPTU',
        'Sondir',
        'Topography',
        'Geolistrik',
        'Aksesoris',
        'Alat lab',
        'Perlengkapan lainnya'
      ]
    },

    brand: { type: String, trim: true, required: true }, // merk
    type: { type: String, trim: true, required: true }, // tipe / model
    description: { type: String },

    purchase_date: { type: Date, required: true },
    price: { type: Number, required: true },

    product_image: {
      key: { type: String },
      contentType: { type: String },
      size: { type: Number },
      uploadedAt: { type: Date, default: Date.now }
    },

    invoice: {
      key: { type: String, required: true },
      contentType: { type: String, required: true },
      size: { type: Number },
      uploadedAt: { type: Date, default: Date.now }
    }
  },
  { timestamps: true }
);

productSchema.index({ category: 1, brand: 1, type: 1 });

module.exports = mongoose.model('Product', productSchema);
