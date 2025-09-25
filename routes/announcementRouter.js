'use strict';

const express = require('express');
const router = express.Router();

const {
  createAnnouncement,
  getAllAnnouncements,
  getAnnouncementById,
  updateAnnouncement,
  deleteAnnouncement,
  getActiveAnnouncements
} = require('../controller/announcementController');

router.post('/create-announcement', createAnnouncement);
router.get('/all-announcement', getAllAnnouncements);
router.get('/employee/active', getActiveAnnouncements);

router.get('/:id', getAnnouncementById);
router.put('/update/:id', updateAnnouncement);
router.delete('/remove/:id', deleteAnnouncement);

module.exports = router;
