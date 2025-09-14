const express = require('express');
const {
  getExpenseLogs,
  getExpenseLog,
  refreshExpenseLogUrls,
  removeExpenseLog
} = require('../../controller/admin/expenseLogController');

const Router = express.Router();

Router.get('/all-expense-log', getExpenseLogs);
Router.get('/:id', getExpenseLog);
Router.get('/:id/refresh-nota', refreshExpenseLogUrls);
Router.delete('/remove/:id', removeExpenseLog);

module.exports = Router;
