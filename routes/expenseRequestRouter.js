const express = require('express');
const Router = express.Router();

const validate = require('../middleware/validations/validate');
const validateToken = require('../middleware/validations/validateTokenHandler');
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
  getMyExpenseRequests
} = require('../controller/expenseRequestController');

Router.post(
  '/add-expense',
  validateToken,
  validate(createExpenseRequestSchema),
  addExpenseRequest
);

Router.get('/all-expense', getExpenseRequests);
Router.get('/all-employee', getAllEmployee);
Router.get('/all-project', getAllProject);
Router.get('/my-expense-request', getMyExpenseRequests);

Router.get('/:id/categories', getCategoriesByExpenseType);

Router.get('/:id', getExpenseRequest);

Router.put(
  '/update/:id',
  validateToken,
  validate(updateExpenseRequestSchema),
  updateExpenseRequest
);

Router.delete('/remove/:id', validateToken, deleteExpenseRequest);

module.exports = Router;
