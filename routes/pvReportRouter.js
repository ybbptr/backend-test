// routes/pvReportRoutes.js
const express = require('express');
const Router = express.Router();
const validate = require('../middleware/validations/validate');

const {
  createPVReportSchema,
  updatePVReportSchema
} = require('../middleware/validations/validatePvReport');

const {
  addPVReport,
  getPVReports,
  getPVReport,
  updatePVReport,
  deletePVReport,
  approvePVReport,
  rejectPVReport,
  reopenPVReport,
  getMyPVNumbers,
  getPVForm,
  getAllEmployee
} = require('../controller/pvReportController');

// util upload nota (mirip uploadProofs)
const { uploadNota, filterNotaFiles } = require('../utils/uploadNota');

// ============ ROUTES ============

// FE helpers
Router.get('/all-employee', getAllEmployee);
Router.get('/all-report', getPVReports);
Router.get('/pv-list', getMyPVNumbers);
Router.get('/form/:pv_number', getPVForm);

// Actions (letakkan sebelum '/:id')
Router.post('/approve/:id', approvePVReport); // admin only
Router.post('/reject/:id', rejectPVReport); // admin only (note dicek di controller)
Router.post('/reopen/:id', reopenPVReport); // ditolak: owner/admin; disetujui: admin

// CRUD
Router.post(
  '/add-report',
  uploadNota,
  filterNotaFiles,
  validate(createPVReportSchema),
  addPVReport
);

Router.put(
  '/update/:id',
  uploadNota,
  filterNotaFiles,
  validate(updatePVReportSchema),
  updatePVReport
);

Router.delete('/remove/:id', deletePVReport);
Router.get('/:id', getPVReport);

module.exports = Router;
