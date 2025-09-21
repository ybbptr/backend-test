const express = require('express');
const Router = express.Router();
const validate = require('../middleware/validations/validate');
const {
  validateReturnLoan,
  validateUpdateReturnLoan
} = require('../middleware/validations/validateReturnLoan');

const {
  // createReturnLoan,
  getAllReturnLoan,
  getReturnLoan,
  updateReturnLoan,
  deleteReturnLoan,
  getReturnForm,
  getAllWarehouse,
  getShelvesByWarehouse,
  getMyLoanNumbers,
  reopenReturnLoan,
  finalizeReturnLoanById,
  finalizeReturnLoanOneShot
} = require('../controller/returnLoanController');

const { createReturnLoan } = require('../controller/debug');

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

Router.get('/all-return-loan', getAllReturnLoan);
Router.get('/my-loan', getMyLoanNumbers);
Router.post('/finalize', finalizeReturnLoanOneShot);
Router.get('/form/:loan_number', getReturnForm);

Router.post('/:id/finalize', finalizeReturnLoanById);
Router.get('/:id', getReturnLoan);

Router.patch(
  '/update/:id',
  uploadProofs,
  filterProofFiles,
  validate(validateUpdateReturnLoan),
  updateReturnLoan
);
Router.delete('/remove/:id', deleteReturnLoan);
Router.post('/reopen/:id', reopenReturnLoan);

module.exports = Router;
