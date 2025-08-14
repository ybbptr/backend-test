const asyncHandler = require('express-async-handler');
const throwError = require('../../utils/throwError');
const Loan = require('../../model/loanModel');
const Employee = require('../../model/employeeModel');

const addLoan = asyncHandler(async (req, res) => {
  const {
    loan_number,
    loan_date,
    return_date,
    employee,
    approval,
    project_type
  } = req.body || {};

  if (!loan_number || !loan_date || !return_date || !employee || !project_type)
    throwError('Field ini harus diisi', 400);

  const loan_item = await Loan.create({
    loan_number,
    loan_date,
    return_date,
    employee,
    approval,
    project_type
  });

  res.status(201).json(loan_item);
});

const getLoans = asyncHandler(async (req, res) => {
  const loan_items = await Loan.find().populate('employee', 'name').exec();
  res.status(200).json(loan_items);
});

const getLoan = asyncHandler(async (req, res) => {
  const loan_item = await Loan.findById(req.params.id)
    .populate('employee', 'name')
    .exec();
  if (!loan_item) throwError('Pengajuan tidak terdaftar!', 400);

  res.status(200).json(loan_item);
});

const removeLoan = asyncHandler(async (req, res) => {
  const loan_item = await Loan.findById(req.params.id);
  if (!loan_item) throwError('Pengajuan tidak terdaftar!', 400);

  await loan_item.findByIdAndDelete(req.params.id);
  res.status(200).json({ message: 'Pengajuan berhasil dihapus.' });
});

const updateLoan = asyncHandler(async (req, res) => {
  const {
    loan_number,
    loan_date,
    return_date,
    employee,
    approval,
    project_type
  } = req.body || {};

  const loan_item = await Loan.findById(req.params.id);
  if (!loan_item) throwError('Pengajuan tidak terdaftar!', 404);

  loan_item.loan_number = loan_number || loan_item.loan_number;
  loan_item.loan_date = loan_date || loan_item.loan_date;
  loan_item.return_date = return_date || loan_item.return_date;
  loan_item.employee = employee || loan_item.employee;
  loan_item.approval = approval || loan_item.approval;
  loan_item.project_type = project_type || loan_item.project_type;

  await loan_item.save();
  res.status(200).json(loan_item);
});

const getAllEmployee = asyncHandler(async (req, res) => {
  const employee = await Employee.find().select('name');

  res.json(employee);
});

module.exports = {
  addLoan,
  getLoans,
  getLoan,
  removeLoan,
  updateLoan,
  getAllEmployee
};
