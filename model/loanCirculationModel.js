const mongoose = require('mongoose');

const { Schema, Types } = mongoose;
const ObjectId = Types.ObjectId;

const loanCirculationSchema = new Schema(
  {
    loan_number: { type: String, required: true, index: true },
    borrower: { type: ObjectId, ref: 'Employee', required: true },
    phone: { type: String, required: true },
    inventory_manager: { type: String, required: true },

    warehouse_to: { type: ObjectId, ref: 'Warehouse' },
    shelf_to: { type: ObjectId, ref: 'Shelf' },
    loan_date_circulation: { type: Date },

    borrowed_items: [
      {
        inventory: { type: ObjectId, ref: 'Inventory', required: true },
        product: { type: ObjectId, ref: 'Product', required: true },
        product_code: String,
        brand: String,
        quantity: Number,
        project: { type: ObjectId, ref: 'RAP' },
        condition: String,
        product_image: {
          key: String,
          contentType: String,
          size: Number,
          uploadedAt: Date
        },
        item_status: {
          type: String,
          enum: ['Dipinjam', 'Dikembalikan', 'Hilang'],
          default: 'Dipinjam'
        },
        return_date_circulation: { type: Date, default: null },
        warehouse_from: { type: ObjectId, ref: 'Warehouse' },
        shelf_from: { type: ObjectId, ref: 'Shelf' }
      }
    ]
  },
  { timestamps: true }
);

loanCirculationSchema.index({ 'borrowed_items.project': 1 });

module.exports = mongoose.model('LoanCirculation', loanCirculationSchema);
