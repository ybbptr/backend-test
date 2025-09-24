const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const s3Backup = new S3Client({
  region: process.env.WASABI_REGION,
  endpoint: `https://s3.${process.env.WASABI_REGION}.wasabisys.com`,
  credentials: {
    accessKeyId: process.env.WASABI_ACCESS_KEY,
    secretAccessKey: process.env.WASABI_SECRET_KEY
  }
});

// Upload file backup
async function uploadBackup(key, body, contentType = 'application/gzip') {
  const command = new PutObjectCommand({
    Bucket: process.env.WASABI_BACKUP_BUCKET,
    Key: key,
    Body: body,
    ContentType: contentType
  });
  return await s3Backup.send(command);
}

async function getBackupUrl(key, expiresIn = 300) {
  const command = new GetObjectCommand({
    Bucket: process.env.WASABI_BACKUP_BUCKET,
    Key: key
  });
  return await getSignedUrl(s3Backup, command, { expiresIn });
}

module.exports = {
  uploadBackup,
  getBackupUrl,
  s3Backup
};
