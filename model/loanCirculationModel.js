const mongoose = require('mongoose');

const loanCirculationSchema = new mongoose.Schema(
  {
    loan_number: { type: String, required: true, index: true },
    borrower: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      required: true
    },
    phone: { type: String, required: true },
    inventory_manager: { type: String, required: true },

    warehouse_to: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse' },
    shelf_to: { type: mongoose.Schema.Types.ObjectId, ref: 'Shelf' },

    borrowed_items: [
      {
        product: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Product',
          required: true
        },
        product_code: String,
        brand: String,
        quantity: Number,
        project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project' },
        condition: String,
        product_image: {
          key: String,
          contentType: String,
          size: Number,
          uploadedAt: Date
        },
        // status: { type: String, enum: ['Dipinjam', 'Dikembalikan'] },
        warehouse_from: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Warehouse'
        },
        shelf_from: { type: mongoose.Schema.Types.ObjectId, ref: 'Shelf' }
      }
    ]
  },
  { timestamps: true }
);

module.exports = mongoose.model('LoanCirculation', loanCirculationSchema);
