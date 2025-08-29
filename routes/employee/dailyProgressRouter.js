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

const validateToken = require('../../middleware/validations/validateTokenHandler');

router.get('/', validateToken, getProjects);
router.get('/:id', validateToken, getProject);

router.get('/:projectId/daily-progress', validateToken, getAllDailyProgress);
router.put(
  '/:projectId/daily-progress/:local_date',
  validateToken,
  upsertDailyProgress
);
router.get(
  '/:projectId/daily-progress/:local_date',
  validateToken,
  getDailyProgress
);

router.delete(
  '/:projectId/daily-progress/:local_date',
  validateToken,
  removeDailyProgress
);

module.exports = router;
