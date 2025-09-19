// routes/expenseRequestRoutes.js
const express = require('express');
const Router = express.Router();

const validate = require('../middleware/validations/validate');
const {
  createExpenseRequestSchema,
  updateExpenseRequestSchema
} = require('../middleware/validations/validateExpenseRequest');

const {
  addExpenseRequest,
  getExpenseRequests,
  getExpenseRequest,
  updateExpenseRequest,
  deleteExpenseRequest,
  getCategoriesByExpenseType,
  getAllProject,
  getAllEmployee,
  getMyExpenseRequests,
  getEmployee,
  // aksi status
  approveExpenseRequest,
  rejectExpenseRequest,
  reopenExpenseRequest
} = require('../controller/expenseRequestController');

Router.post(
  '/add-expense',
  validate(createExpenseRequestSchema),
  addExpenseRequest
);

Router.get('/all-expense', getExpenseRequests);
Router.get('/my-expense-request', getMyExpenseRequests);

Router.get('/all-employee', getAllEmployee);
Router.get('/employee', getEmployee);
Router.get('/all-project', getAllProject);
Router.get('/:id', getExpenseRequest);
Router.get('/:id/categories', getCategoriesByExpenseType);

Router.put(
  '/update/:id',
  validate(updateExpenseRequestSchema),
  updateExpenseRequest
);

Router.post('/approve/:id', approveExpenseRequest);
Router.post('/reject/:id', rejectExpenseRequest);
Router.post('/reopen/:id', reopenExpenseRequest);
Router.delete('/remove/:id', deleteExpenseRequest);

module.exports = Router;
