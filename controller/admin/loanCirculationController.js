const asyncHandler = require('express-async-handler');
const throwError = require('../../utils/throwError');
const loanCirculationModel = require('../../model/loanCirculationModel');

const getLoanCirculations = asyncHandler(async (req, res) => {
  const loanCirculations = await loanCirculationModel
    .find()
    .populate('warehouse_from', 'warehouse_name warehouse_code')
    .populate('warehouse_to', 'warehouse_name warehouse_code')
    .populate('product', 'product_name product_code');

  res.status(200).json(loanCirculations);
});

const getLoanCirculation = asyncHandler(async (req, res) => {
  const loanCirculation = await loanCirculationModel
    .findById(req.params.id)
    .populate('warehouse_from', 'warehouse_name warehouse_code')
    .populate('warehouse_to', 'warehouse_name warehouse_code')
    .populate('product', 'product_name product_code');

  if (!loanCirculation) throwError('Sirkulasi tidak terdaftar!', 400);

  res.status(200).json(loanCirculation);
});

const removeLoanCirculation = asyncHandler(async (req, res) => {
  const loanCirculation = await loanCirculationModel.findById(req.params.id);
  if (!loanCirculation) throwError('Sirkulasi tidak terdaftar!', 400);

  await loanCirculation.deleteOne();
  res.status(200).json({ message: 'Sirkulasi berhasil dihapus.' });
});

module.exports = {
  getLoanCirculations,
  getLoanCirculation,
  removeLoanCirculation
};
