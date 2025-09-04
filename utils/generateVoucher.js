const Counter = require('../model/counterModel');

async function generateVoucherNumber(prefix) {
  const counter = await Counter.findByIdAndUpdate(
    { _id: prefix },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );

  return `${prefix}-${String(counter.seq).padStart(4, '0')}`;
}

module.exports = generateVoucherNumber;
