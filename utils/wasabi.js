const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  CopyObjectCommand
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

async function copyObject(srcKey, destKey, contentType) {
  const command = new CopyObjectCommand({
    Bucket: process.env.WASABI_BUCKET,
    CopySource: `/${process.env.WASABI_BUCKET}/${encodeURIComponent(srcKey)}`,
    Key: destKey,
    MetadataDirective: 'REPLACE', // biar ContentType bisa diganti
    ContentType: contentType // penting buat preview
  });
  return s3.send(command);
}

async function uploadBuffer(key, body, opts) {
  const params = {
    Bucket: process.env.WASABI_BUCKET,
    Key: key,
    Body: body
  };
  // backward-compatible: boleh string atau object
  if (typeof opts === 'string') {
    params.ContentType = opts;
  } else if (opts && typeof opts === 'object') {
    if (opts.contentType) params.ContentType = opts.contentType;
    if (opts.cacheControl) params.CacheControl = opts.cacheControl;
  }

  const command = new PutObjectCommand(params);
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

module.exports = {
  uploadBuffer,
  getFileUrl,
  deleteFile,
  getFileStream,
  copyObject
};
