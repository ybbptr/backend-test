const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const { uploadBackup } = require('../utils/wasabiBackup');
const BackupLog = require('../model/backupLogModel');

async function backupDatabase(type = 'daily') {
  return new Promise((resolve, reject) => {
    const timestamp = new Date();
    let filename;

    if (type === 'daily') {
      filename = `daily-${timestamp.toISOString().split('T')[0]}.gz`;
    } else if (type === 'weekly') {
      const year = timestamp.getUTCFullYear();
      const week = Math.ceil(
        ((timestamp - new Date(Date.UTC(year, 0, 1))) / 86400000 +
          new Date(Date.UTC(year, 0, 1)).getUTCDay() +
          1) /
          7
      );
      filename = `weekly-${year}-W${week}.gz`;
    } else if (type === 'monthly') {
      const month = String(timestamp.getUTCMonth() + 1).padStart(2, '0');
      filename = `monthly-${timestamp.getUTCFullYear()}-${month}.gz`;
    } else {
      return reject(new Error('Invalid backup type'));
    }

    const tmpPath = path.join('/tmp', filename);
    const dumpCmd = `mongodump --uri="${process.env.CONNECTION_STRING}" --archive=${tmpPath} --gzip`;

    exec(dumpCmd, async (err) => {
      if (err) {
        await BackupLog.create({
          type,
          bucket: process.env.WASABI_BACKUP_BUCKET,
          key: `db-backup/${type}/${filename}`,
          status: 'failed',
          message: err.message
        });
        return reject(err);
      }

      try {
        const stats = fs.statSync(tmpPath); // ukuran file
        const fileStream = fs.createReadStream(tmpPath);
        const key = `db-backup/${type}/${filename}`;

        await uploadBackup(key, fileStream);

        fs.unlinkSync(tmpPath);

        const log = await BackupLog.create({
          type,
          bucket: process.env.WASABI_BACKUP_BUCKET,
          key,
          size: stats.size,
          status: 'success'
        });

        resolve({
          success: true,
          message: 'Backup berhasil',
          log
        });
      } catch (uploadErr) {
        await BackupLog.create({
          type,
          bucket: process.env.WASABI_BACKUP_BUCKET,
          key: `db-backup/${type}/${filename}`,
          status: 'failed',
          message: uploadErr.message
        });
        reject(uploadErr);
      }
    });
  });
}

module.exports = { backupDatabase };
