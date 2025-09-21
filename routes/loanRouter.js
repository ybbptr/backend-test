const express = require('express');
const Router = express.Router();
const validate = require('../middleware/validations/validate');
const { checkDuplicate } = require('../middleware/checkDuplicate');
const Loan = require('../model/loanModel');
const {
  createLoanSchema,
  updateLoanSchema
} = require('../middleware/validations/validateLoan');
const {
  createLoan,
  deleteLoan,
  getLoan,
  getLoans,
  updateLoan,
  approveLoan,
  rejectLoan,
  reopenLoan,
  getAllEmployee,
  getAllProduct,
  getAllWarehouse,
  getLoansByEmployee,
  getEmployee,
  getAllProject,
  getShelvesByProductAndWarehouse,
  getWarehousesByProduct
} = require('../controller/loanController');

Router.post(
  '/add-loan',
  validate(createLoanSchema),
  checkDuplicate(Loan, { loan_number: 'Nomor peminjaman' }),
  createLoan
)
  .get('/all-loan', getLoans)
  .get('/all-employee', getAllEmployee)
  .get('/employee', getEmployee)
  .get('/all-product', getAllProduct)
  .get('/all-warehouse', getAllWarehouse)
  .get('/my-loans', getLoansByEmployee)
  .get('/all-project', getAllProject);

Router.get('/products/:productId/warehouses', getWarehousesByProduct);
Router.get(
  '/products/:productId/warehouses/:warehouseId/shelves',
  getShelvesByProductAndWarehouse
);

Router.post('/reopen/:id', reopenLoan);
Router.post('/reject/:id', rejectLoan);
Router.post('/approve/:id', approveLoan);

Router.get('/:id', getLoan)
  .put(
    '/update/:id',
    validate(updateLoanSchema),
    checkDuplicate(Loan, { loan_number: 'Nomor peminjaman' }),
    updateLoan
  )
  .delete('/remove/:id', deleteLoan);

module.exports = Router;
