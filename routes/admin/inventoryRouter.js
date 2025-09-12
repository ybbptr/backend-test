const express = require('express');
const Product = require('../../model/productModel');
const { checkDuplicate } = require('../../middleware/checkDuplicate');
const validate = require('../../middleware/validations/validate');
const {
  createProductSchema
} = require('../../middleware/validations/validateProduct');
const {
  addStock,
  getInventory,
  getInventoryById,
  updateInventory,
  removeInventory,
  addNewProductInInventory,
  getWarehouses,
  getShelvesByWarehouse,
  getWarehousesWithStock,
  getProductList,
  getTotalByShelf,
  getTotalByWarehouse,
  dropdownWarehouseWithStock
} = require('../../controller/admin/inventoryController');

const multer = require('multer');

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const isImage = /jpeg|jpg|png/.test(file.mimetype.toLowerCase());
  const isPdf = /pdf/.test(file.mimetype.toLowerCase());

  if (isImage || isPdf) cb(null, true);
  else cb(new Error('File harus berupa jpg, jpeg, png, atau pdf'));
};

const uploadProductFiles = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 } // 10 MB
});

const Router = express.Router();

// Tambah stok ke produk existing
Router.post('/add-stock', addStock);

// Tambah produk baru lewat inventory (bikin Product + stok awal)
Router.post(
  '/add-product',
  uploadProductFiles.fields([
    { name: 'product_image', maxCount: 1 },
    { name: 'invoice', maxCount: 1 }
  ]),
  validate(createProductSchema),
  checkDuplicate(Product, { product_code: 'Kode barang' }),
  addNewProductInInventory
);

// Ambil semua inventory (support filter & search)
Router.get('/all-inventory', getInventory);

Router.get('/product-list', getProductList);
Router.get('/warehouse-list', getTotalByWarehouse);
Router.get('/shelf-list', getTotalByShelf);

// Ambil semua gudang (list basic)
Router.get('/all-warehouse', getWarehouses);

// Ambil semua gudang beserta shelves + total stok
Router.get('/warehouse', getWarehousesWithStock);

// Ambil lemari berdasarkan gudang
Router.get('/warehouses/:id/shelves', getShelvesByWarehouse);
Router.get('/:id/warehouses-with-stock', dropdownWarehouseWithStock);

// Ambil detail inventory by ID
Router.get('/:id', getInventoryById);

// Update stok inventory
Router.put('/update/:id', updateInventory);

// Hapus record inventory
Router.delete('/remove/:id', removeInventory);

module.exports = Router;
