// model/stockAdjustmentModel.js
'use strict';

const mongoose = require('mongoose');
const { Schema, Types } = mongoose;

const BUCKETS = ['ON_HAND', 'ON_LOAN'];

const REASON_CODES = [
  'LOAN_OUT',
  'REVERT_LOAN_OUT',
  'RETURN_IN',
  'REVERT_RETURN',
  'MARK_LOST',
  'REVERT_MARK_LOST',
  'MOVE_INTERNAL',
  'MANUAL_EDIT',
  'MANUAL_CORRECTION',
  'SYSTEM_CORRECTION',
  'CHANGE_CONDITION'
];

const stockAdjustmentSchema = new Schema(
  {
    inventory: {
      type: Types.ObjectId,
      ref: 'Inventory',
      required: true,
      index: true
    },

    bucket: { type: String, enum: BUCKETS, required: true }, // ON_HAND | ON_LOAN
    delta: { type: Number, required: true }, // + / -
    before: { type: Number, required: true }, // nilai sebelum perubahan
    after: { type: Number, required: true }, // nilai sesudah perubahan

    reason_code: { type: String, enum: REASON_CODES, required: true },
    reason_note: { type: String, default: null },

    actor_id: { type: Types.ObjectId, ref: 'User', default: null },
    actor_name: { type: String, default: null },

    // metadata untuk trace
    correlation: {
      loan_id: { type: Types.ObjectId, ref: 'Loan', default: null },
      loan_number: { type: String, default: null },
      return_loan_id: { type: Types.ObjectId, ref: 'ReturnLoan', default: null }
    }
  },
  { timestamps: true }
);

stockAdjustmentSchema.index({ inventory: 1, createdAt: -1 });

module.exports = mongoose.model('StockAdjustment', stockAdjustmentSchema);
module.exports.BUCKETS = BUCKETS;
module.exports.REASON_CODES = REASON_CODES;
