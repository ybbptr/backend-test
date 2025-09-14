const express = require('express');
const Router = express.Router();
const validate = require('../middleware/validations/validate');
const {
  pvReportSchema
} = require('../middleware/validations/validatePvReport');

const {
  createPVReport,
  getAllPVReports,
  getPVReport,
  updatePVReport,
  deletePVReport,
  getMyPVNumbers,
  getPVForm,
  getAllEmployee
} = require('../controller/pvReportController');

// util upload nota (mirip uploadProofs)
const { uploadNota, filterNotaFiles } = require('../utils/uploadNota');

// ============ ROUTES ============

// ambil semua karyawan (dropdown)
Router.get('/all-employee', getAllEmployee);

// list semua pv report (admin & karyawan → auto filter by role)
Router.get('/all-report', getAllPVReports);

// list nomor PV yg bisa dipakai karyawan / admin
Router.get('/pv-list', getMyPVNumbers);

// ambil form auto isi dari nomor PV
Router.get('/form/:pv_number', getPVForm);

// CRUD
Router.post(
  '/add-report',
  uploadNota,
  filterNotaFiles,
  validate(pvReportSchema),
  createPVReport
);

Router.get('/:id', getPVReport);

Router.put(
  '/update/:id',
  uploadNota,
  filterNotaFiles,
  validate(pvReportSchema),
  updatePVReport
);

Router.delete('/remove/:id', deletePVReport);

module.exports = Router;
