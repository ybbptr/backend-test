const express = require('express');
const Router = express.Router();
const validate = require('../../middleware/validations/validate');
const { checkDuplicate } = require('../../middleware/checkDuplicate');
const Loan = require('../../model/loanModel');
const {
  createLoanSchema,
  updateLoanSchema
} = require('../../middleware/validations/validateLoan');
const {
  addLoan,
  getLoan,
  getLoans,
  removeLoan,
  updateLoan,
  getAllEmployee,
  getAllProduct,
  getLoanPdf,
  getAllWarehouse,
  getShelves
} = require('../../controller/admin/loanController');

Router.post(
  '/add-loan',
  validate(createLoanSchema),
  checkDuplicate(Loan, { loan_number: 'Nomor peminjaman' }),
  addLoan
)
  .get('/all-loan', getLoans)
  .get('/all-employee', getAllEmployee)
  .get('/all-product', getAllProduct)
  .get('/all-warehouse', getAllWarehouse);

Router.get('/shelves', getShelves);
Router.get('/:id/pdf', getLoanPdf);
Router.get('/:id', getLoan)
  .put(
    '/update/:id',
    validate(updateLoanSchema),
    checkDuplicate(Loan, { loan_number: 'Nomor peminjaman' }),
    updateLoan
  )
  .delete('/remove/:id', removeLoan);

module.exports = Router;
