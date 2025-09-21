const mongoose = require('mongoose');
const { Schema, Types } = mongoose;
const ObjectId = Types.ObjectId;

const returnedItemSchema = new Schema(
  {
    _id: { type: ObjectId, required: true },

    inventory: { type: ObjectId, ref: 'Inventory', required: true },
    product: { type: ObjectId, ref: 'Product', required: true },
    product_code: { type: String, required: true },
    brand: { type: String, required: true },

    quantity: { type: Number, required: true, min: 1 },

    warehouse_return: { type: ObjectId, ref: 'Warehouse', default: null },
    shelf_return: { type: ObjectId, ref: 'Shelf', default: null },

    condition_new: {
      type: String,
      enum: ['Baik', 'Rusak', 'Maintenance', 'Hilang'],
      required: true
    },

    project: { type: ObjectId, ref: 'RAP', default: null },

    lost_reason: { type: String, default: null },

    proof_image: {
      key: String,
      contentType: String,
      size: Number,
      uploadedAt: { type: Date, default: Date.now }
    }
  },
  { _id: false }
);

const returnLoanSchema = new Schema(
  {
    loan_number: { type: String, required: true, index: true },
    borrower: { type: ObjectId, ref: 'Employee', required: true },
    position: { type: String },

    report_date: { type: Date, default: Date.now },
    return_date: { type: Date, default: Date.now },

    inventory_manager: {
      type: String,
      enum: ['Owan H.', 'Teguh F.', 'Korlap']
    },
    status: {
      type: String,
      enum: ['Draft', 'Dikembalikan'],
      default: 'Draft',
      index: true
    },
    needs_review: { type: Boolean, default: false },
    loan_locked: { type: Boolean, default: false },
    returned_items: [returnedItemSchema]
  },
  { timestamps: true }
);

returnLoanSchema.index({ 'returned_items.inventory': 1 });

module.exports = mongoose.model('ReturnLoan', returnLoanSchema);
