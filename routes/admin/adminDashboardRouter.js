const express = require('express');
const Router = express.Router();

const {
  getAdminDashboard
} = require('../../controller/admin/adminDashboardController');

Router.get('/admin-dashboard', getAdminDashboard);

module.exports = Router;
