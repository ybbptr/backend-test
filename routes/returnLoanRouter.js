const express = require('express');
const Router = express.Router();
const validate = require('../middleware/validations/validate');
const {
  validateReturnLoan,
  validateUpdateReturnLoan
} = require('../middleware/validations/validateReturnLoan');
const {
  createReturnLoan,
  getAllReturnLoan,
  getReturnLoan,
  updateReturnLoan,
  deleteReturnLoan,
  getReturnForm,
  getAllWarehouse,
  getShelvesByWarehouse,
  getAllEmployee,
  getMyLoanNumbers
} = require('../controller/returnLoanController');

const { uploadProofs, filterProofFiles } = require('../utils/uploadProofs');

Router.get('/all-warehouse', getAllWarehouse);
Router.get('/shelves', getShelvesByWarehouse);

Router.post(
  '/add-return-loan',
  uploadProofs,
  filterProofFiles,
  validate(validateReturnLoan),
  createReturnLoan
);

Router.get('/all-return-loan', getAllReturnLoan)
  .get('/all-employee', getAllEmployee)
  .get('/my-loan', getMyLoanNumbers)
  .get('/form/:loan_number', getReturnForm);

Router.get('/:id', getReturnLoan);
Router.delete('/remove/:id', deleteReturnLoan);

Router.put(
  '/update/:id',
  uploadProofs,
  filterProofFiles,
  validate(validateUpdateReturnLoan),
  updateReturnLoan
);

module.exports = Router;
