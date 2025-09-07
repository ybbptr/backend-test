const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const s3 = new S3Client({
  region: process.env.WASABI_REGION,
  endpoint: `https://s3.${process.env.WASABI_REGION}.wasabisys.com`,
  credentials: {
    accessKeyId: process.env.WASABI_ACCESS_KEY,
    secretAccessKey: process.env.WASABI_SECRET_KEY
  }
});

async function uploadBuffer(key, body) {
  const command = new PutObjectCommand({
    Bucket: process.env.WASABI_BUCKET,
    Key: key,
    Body: body
  });

  return await s3.send(command);
}

async function getFileUrl(key, expiresIn = 300, disposition = 'inline') {
  const command = new GetObjectCommand({
    Bucket: process.env.WASABI_BUCKET,
    Key: key,
    ResponseContentDisposition: disposition // "inline" | "attachment"
  });
  return await getSignedUrl(s3, command, { expiresIn });
}

async function deleteFile(key) {
  const command = new DeleteObjectCommand({
    Bucket: process.env.WASABI_BUCKET,
    Key: key
  });
  return await s3.send(command);
}

async function getFileStream(key) {
  const command = new GetObjectCommand({
    Bucket: process.env.WASABI_BUCKET,
    Key: key
  });
  const { Body } = await s3.send(command);
  return Body;
}

module.exports = { uploadBuffer, getFileUrl, deleteFile, getFileStream };
