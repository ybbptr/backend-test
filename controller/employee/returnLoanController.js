const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const path = require('path');
const throwError = require('../../utils/throwError');
const Loan = require('../../model/loanModel');
const Product = require('../../model/productModel');
const loanCirculationModel = require('../../model/loanCirculationModel');
const ReturnLoan = require('../../model/returnLoanModel');
const { uploadBuffer } = require('../../utils/wasabi');
const formatDate = require('../../utils/formatDate');

/* ============= CREATE RETURN ============= */
const createReturnLoan = asyncHandler(async (req, res) => {
  const {
    loan_number,
    borrower,
    position,
    report_date,
    return_date,
    inventory_manager
  } = req.body || {};

  // `returned_items` dikirim FE dalam JSON
  let returned_items = [];
  if (req.body.returned_items) {
    returned_items = JSON.parse(req.body.returned_items); // FE kirim JSON string
  }

  if (!loan_number || returned_items.length === 0) {
    throwError('Nomor peminjaman dan daftar barang wajib diisi!', 400);
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const loan = await Loan.findOne({ loan_number }).session(session);
    if (!loan) throwError('Peminjaman tidak ditemukan!', 404);
    if (loan.circulation_status !== 'Aktif') {
      throwError('Peminjaman tidak aktif atau sudah selesai!', 400);
    }

    const circulation = await loanCirculationModel
      .findOne({ loan_number })
      .session(session);
    if (!circulation) throwError('Sirkulasi tidak ditemukan!', 404);

    // === Proses setiap barang yang dikembalikan ===
    for (let i = 0; i < returned_items.length; i++) {
      const ret = returned_items[i];
      const product = await Product.findById(ret.product).session(session);
      if (!product) throwError('Produk tidak ditemukan', 404);

      // update stok
      product.quantity += ret.quantity;
      product.loan_quantity -= ret.quantity;
      product.warehouse = ret.warehouse_return || product.warehouse;
      product.shelf = ret.shelf_return || product.shelf;
      product.condition = ret.condition_new || product.condition;
      await product.save({ session });

      // cari file bukti sesuai index barang
      const file = req.files?.[`proof_${i}`]?.[0]; // FE harus kirim proof_0, proof_1, ...
      if (file) {
        const ext = path.extname(file.originalname);
        const key = `bukti_pengembalian_barang/${loan_number}/bukti_pengembalian_${formatDate()}${ext}`;

        await uploadBuffer(file.buffer, key, file.mimetype);

        ret.proof_image = {
          key,
          contentType: file.mimetype,
          size: file.size,
          uploadedAt: new Date()
        };
      }

      // update circulation
      const circItem = circulation.borrowed_items.find(
        (it) => it.product.toString() === ret.product.toString()
      );
      if (circItem) {
        circItem.item_status = 'Dikembalikan';
        circItem.return_date_circulation = return_date || new Date();
      }
    }

    await circulation.save({ session });

    // simpan laporan pengembalian
    const returnLoan = await ReturnLoan.create(
      [
        {
          loan_number,
          borrower,
          position,
          report_date,
          return_date,
          inventory_manager,
          returned_items
        }
      ],
      { session }
    );

    // cek apakah semua barang sudah kembali
    const allReturned = circulation.borrowed_items.every(
      (it) => it.item_status === 'Dikembalikan'
    );
    if (allReturned) {
      loan.circulation_status = 'Selesai';
      await loan.save({ session });
    }

    await session.commitTransaction();
    session.endSession();

    res.status(201).json(returnLoan[0]);
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    throw error;
  }
});

module.exports = { createReturnLoan };
