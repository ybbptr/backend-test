const multerErrorHandler = (err, req, res, next) => {
  if (err instanceof Error && err.message.includes('File too large')) {
    return res.status(400).json({ message: 'Ukuran file melebihi batas 2MB!' });
  }

  if (
    err instanceof Error &&
    err.message.includes('Hanya file PDF yang diizinkan!')
  ) {
    return res.status(400).json({ message: err.message });
  }

  next(err);
};

module.exports = multerErrorHandler;
