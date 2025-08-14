const express = require('express');
const Router = express.Router();
const validate = require('../../middleware/validations/validate');
const checkDuplicate = require('../../middleware/checkDuplicate');
const Loan = require('../../model/loanModel');
const validateLoan = require('../../middleware/validations/validateLoan');
const {
  addLoan,
  getLoan,
  getLoans,
  removeLoan,
  updateLoan,
  getAllEmployee
} = require('../../controller/admin/loanController');

Router.post(
  '/add-loan',
  validate(validateLoan),
  checkDuplicate(Loan, { loan_number: 'Nomor peminjaman' }),
  addLoan
)
  .get('/all-loan', getLoans)
  .get('/all-employee', getAllEmployee);

Router.get('/:id', getLoan)
  .put(
    '/update/:id',
    validate(validateLoan),
    checkDuplicate(Loan, { loan_number: 'Nomor peminjaman' }),
    updateLoan
  )
  .delete('/remove/:id', removeLoan);

module.exports = Router;
