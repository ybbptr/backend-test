const mongoose = require('mongoose');

const productSchema = new mongoose.Schema(
  {
    purchase_date: { type: Date, required: true },
    price: { type: Number, required: true },
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
    type: { type: String, trim: true, required: true }, // type
    quantity: { type: Number, default: 0, required: true },
    loan_quantity: { type: Number, default: 0 },
    condition: {
      type: String,
      trim: true,
      required: true,
      enum: ['Maintenance', 'Rusak', 'Baik']
    },
    warehouse: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Warehouse',
      required: true
    },
    shelf: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Shelf',
      required: true
    },
    product_code: { type: String, unique: true, required: true, trim: true }, // kode barang
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

productSchema.index({ warehouse: 1 });
productSchema.index({ shelf: 1 });

module.exports = mongoose.model('Product', productSchema);
