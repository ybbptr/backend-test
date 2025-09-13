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
    loan_date_circulation: { type: Date },

    borrowed_items: [
      {
        inventory: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Inventory',
          required: true
        },
        product: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Product',
          required: true
        },
        product_code: String,
        brand: String,
        quantity: Number,
        project: { type: mongoose.Schema.Types.ObjectId, ref: 'RAP' },
        condition: String,
        product_image: {
          key: String,
          contentType: String,
          size: Number,
          uploadedAt: Date
        },
        item_status: {
          type: String,
          enum: ['Dipinjam', 'Dikembalikan', 'Hilang']
        },
        return_date_circulation: { type: Date, default: null },
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
