const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const asyncHandler = require('express-async-handler');

const throwError = require('../../utils/throwError');
const { resolveChatActor } = require('../../utils/chatActor');
const { uploadBuffer, getFileUrl, deleteFile } = require('../../utils/wasabi');

/* ===================== CONFIG ===================== */
const MAX_SIZE = 20 * 1024 * 1024; // 20MB
const ALLOW_MIME = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/zip',
  'application/x-zip-compressed'
];

const storage = multer.memoryStorage();
const multerUpload = multer({
  storage,
  limits: { fileSize: MAX_SIZE },
  fileFilter: (req, file, cb) => {
    if (!ALLOW_MIME.includes(file.mimetype)) {
      return cb(new Error('Tipe file tidak diizinkan'));
    }
    cb(null, true);
  }
});
exports.multerUpload = multerUpload;

/* ===================== HELPERS ===================== */
function makeKey(file, roleLower) {
  const ext = path.extname(file.originalname || '') || '';
  const base = path
    .basename(file.originalname || 'file', ext)
    .replace(/\s+/g, '-')
    .slice(0, 50);
  const uid = crypto.randomUUID();
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');

  // Customer → tmp/customer (akan dipromosikan ke customer/)
  // Admin/Karyawan → chat/
  const prefix = roleLower === 'user' ? 'tmp/customer' : 'chat';
  return `${prefix}/${yyyy}/${mm}/${uid}-${base}${ext}`;
}

/* ===================== HANDLERS ===================== */
exports.handleUpload = asyncHandler(async (req, res) => {
  const actor = await resolveChatActor(req);
  if (!actor.userId) throwError('Unauthorized', 401);

  const roleLower = String(actor.role || '').toLowerCase();
  const files = req.files || [];
  if (!files.length) throwError('Tidak ada file', 400);

  const results = [];
  for (const f of files) {
    const key = makeKey(f, roleLower);
    await uploadBuffer(key, f.buffer, { contentType: f.mimetype });
    results.push({
      key,
      contentType: f.mimetype,
      size: f.size,
      uploadedAt: new Date()
    });
  }

  res.status(201).json({ attachments: results });
});

exports.getSignedUrl = asyncHandler(async (req, res) => {
  const actor = await resolveChatActor(req);
  if (!actor.userId) throwError('Unauthorized', 401);

  const key = req.query.key;
  if (!key) throwError('key wajib diisi', 400);

  const disposition =
    req.query.disposition === 'attachment' ? 'attachment' : 'inline';
  const expiresIn = Math.min(
    Math.max(parseInt(req.query.expires || '300', 10), 60),
    3600
  );

  const url = await getFileUrl(key, expiresIn, disposition);
  res.json({ url });
});

exports.deleteAttachment = asyncHandler(async (req, res) => {
  const actor = await resolveChatActor(req);
  if (!actor.userId) throwError('Unauthorized', 401);

  const key = req.query.key;
  if (!key) throwError('key wajib diisi', 400);

  await deleteFile(key);
  res.json({ ok: true });
});
