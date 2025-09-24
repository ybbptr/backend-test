const express = require('express');
const { backupDatabase } = require('../../services/backupService');
const BackupLog = require('../../model/backupLogModel');

const router = express.Router();

// Manual trigger backup
router.post('/:type', async (req, res) => {
  try {
    const { type } = req.params;
    const result = await backupDatabase(type);
    res.json(result);
  } catch (err) {
    console.error('Backup error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/logs', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const filter = {};

    // Filter by type (daily/weekly/monthly)
    if (req.query.type) {
      filter.type = req.query.type;
    }

    // Filter by status (success/failed)
    if (req.query.status) {
      filter.status = req.query.status;
    }

    // Filter by date range (start & end)
    if (req.query.start && req.query.end) {
      filter.createdAt = {
        $gte: new Date(req.query.start),
        $lte: new Date(req.query.end)
      };
    }

    // Search by key (filename) or error message
    if (req.query.q) {
      filter.$or = [
        { key: { $regex: req.query.q, $options: 'i' } },
        { message: { $regex: req.query.q, $options: 'i' } }
      ];
    }

    const [logs, total] = await Promise.all([
      BackupLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      BackupLog.countDocuments(filter)
    ]);

    res.json({
      success: true,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      logs
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
