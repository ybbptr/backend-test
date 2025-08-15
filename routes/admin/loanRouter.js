// const express = require('express');
// const Router = express.Router();
// const validate = require('../../middleware/validations/validate');
// const checkDuplicate = require('../../middleware/checkDuplicate');
// const Loan = require('../../model/loanModel');
// const validateLoan = require('../../middleware/validations/validateLoan');
// const {
//   addLoan,
//   getLoan,
//   getLoans,
//   removeLoan,
//   updateLoan,
//   getAllEmployee,
//   getAllProduct,
//   getAllWarehouse
// } = require('../../controller/admin/loanController');

// Router.post(
//   '/add-loan',
//   validate(validateLoan),
//   checkDuplicate(Loan, { loan_number: 'Nomor peminjaman' }),
//   addLoan
// )
//   .get('/all-loan', getLoans)
//   .get('/all-employee', getAllEmployee)
//   .get('/all-product', getAllProduct)
//   .get('/all-warehouse', getAllWarehouse);

// Router.get('/:id', getLoan)
//   .put(
//     '/update/:id',
//     validate(validateLoan),
//     checkDuplicate(Loan, { loan_number: 'Nomor peminjaman' }),
//     updateLoan
//   )
//   .delete('/remove/:id', removeLoan);

// module.exports = Router;

const express = require('express');
const Router = express.Router();
const multer = require('multer');
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
  getAllEmployee,
  getAllProduct,
  getAllWarehouse
} = require('../../controller/admin/loanController');

// Multer setup
const storage = multer.memoryStorage(); // karena tidak ada file
const upload = multer({ storage });

Router.post(
  '/add-loan',
  upload.none(), // Multer parse form-data tanpa file
  validate(validateLoan),
  checkDuplicate(Loan, { loan_number: 'Nomor peminjaman' }),
  addLoan
)
  .get('/all-loan', getLoans)
  .get('/all-employee', getAllEmployee)
  .get('/all-product', getAllProduct)
  .get('/all-warehouse', getAllWarehouse);

Router.get('/:id', getLoan)
  .put(
    '/update/:id',
    upload.none(), // parse form-data tanpa file
    validate(validateLoan),
    checkDuplicate(Loan, { loan_number: 'Nomor peminjaman' }),
    updateLoan
  )
  .delete('/remove/:id', removeLoan);

module.exports = Router;
