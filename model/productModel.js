const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  imageUrl: {
    type: String,
    default:
      'https://res.cloudinary.com/dwnvblf1g/image/upload/v1746338190/placeholder_aanaig.png'
  },
  imagePublicId: { type: String },
  product_code: { type: String, trim: true, unique: true, required: true },
  product_name: { type: String, required: true },
  description: { type: String },
  quantity: { type: Number, default: 0 },
  condition: {
    type: String,
    required: true,
    enum: ['Rusak ringan', 'Rusak berat', 'Baik', 'Baru'],
    default: 'Baik'
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
  }
});

module.exports = mongoose.model('Product', productSchema);
