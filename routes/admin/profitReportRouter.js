const express = require('express');
const {
  getAllProfitReports,
  getProfitReportDetail
} = require('../../controller/admin/profitReportController');

const Router = express.Router();

Router.get('/all-reports', getAllProfitReports);
Router.get('/:id', getProfitReportDetail);

module.exports = Router;
