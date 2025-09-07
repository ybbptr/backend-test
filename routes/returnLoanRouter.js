const express = require('express');
const Router = express.Router();
const validate = require('../middleware/validations/validate');
const {
  validateReturnLoan
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
  getAllEmployee
} = require('../controller/returnLoanController');

Router.post('/add-return-loan', validate(validateReturnLoan), createReturnLoan)
  .get('/all-return-loan', getAllReturnLoan)
  .get('/all-employee', getAllEmployee)
  .get('/form/:loan_number', getReturnForm)
  .get('/:id', getReturnLoan)
  .put('/update/:id', validate(validateReturnLoan), updateReturnLoan)
  .delete('/remove/:id', deleteReturnLoan);

Router.get('/all-warehouse', getAllWarehouse);
Router.get('/shelves', getShelvesByWarehouse);

module.exports = Router;
