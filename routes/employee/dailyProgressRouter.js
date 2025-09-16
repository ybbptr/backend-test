const express = require('express');
const router = express.Router();

const {
  getDailyProgress,
  upsertDailyProgress,
  removeDailyProgress,
  getProject,
  getProjects,
  getAllDailyProgress
} = require('../../controller/employee/dailyProgressController');

router.get('/all-project', getProjects);
router.get('/:id', getProject);

router.get('/:projectId/daily-progress', getAllDailyProgress);
router.put('/:projectId/daily-progress/:local_date', upsertDailyProgress);
router.get('/:projectId/daily-progress/:local_date', getDailyProgress);

router.delete('/:projectId/daily-progress/:local_date', removeDailyProgress);

module.exports = router;
