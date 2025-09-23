const express = require('express');
const Router = express.Router();
const {
  getProject,
  getProjects,
  updateProjectTotals
} = require('../controller/progressProjectController');

Router.get('/all-progress', getProjects);
Router.get('/:id', getProject);
Router.patch('/update/total-point/:id', updateProjectTotals);

module.exports = Router;
