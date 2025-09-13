const express = require('express');
const {
  getStockChangeLogs,
  getStockChangeLog,
  removeStockChangeLog
} = require('../../controller/admin/stockLogController');

const Router = express.Router();

Router.get('/all-logs', getStockChangeLogs);
Router.get('/:id', getStockChangeLog);
Router.delete('/remove/:id', removeStockChangeLog);

module.exports = Router;
