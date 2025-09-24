const multer = require('multer');
const throwError = require('../utils/throwError');

// pakai memoryStorage biar file langsung bisa diproses ke Wasabi
const storage = multer.memoryStorage();

// multer setup
const uploadProofs = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // ✅ max 5MB per file
  fileFilter: (req, file, cb) => {
    // cek tipe file (opsional, misal hanya gambar)
    if (!file.mimetype.startsWith('image/')) {
      return cb(throwError('Hanya file gambar yang diperbolehkan!', 400));
    }
    cb(null, true);
  }
}).any(); // handle semua field

// rapikan files ke bentuk { bukti_1: [file], bukti_2: [file], ... }
function filterProofFiles(req, res, next) {
  if (req.files && Array.isArray(req.files)) {
    const grouped = {};
    for (const f of req.files) {
      if (f.fieldname.startsWith('bukti_')) {
        if (!grouped[f.fieldname]) grouped[f.fieldname] = [];
        grouped[f.fieldname].push(f);
      }
    }
    req.files = grouped;
  }
  next();
}

module.exports = { uploadProofs, filterProofFiles };
