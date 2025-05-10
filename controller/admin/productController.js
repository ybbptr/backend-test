const asyncHandler = require('express-async-handler');
const throwError = require('../../utils/throwError');
const Product = require('../../model/productModel');
const cloudinary = require('cloudinary');

const addProduct = asyncHandler(async (req, res) => {
  const { product_code, product_name, description, quantity, place } =
    req.body || {};

  if (!product_code || !product_name) throwError('Field ini harus diisi', 400);

  const imageUrl = req.file
    ? req.file.path
    : 'https://res.cloudinary.com/dwnvblf1g/image/upload/v1746338190/placeholder_aanaig.png';

  const imagePublicId = req.file
    ? req.file.filename
    : 'https://res.cloudinary.com/dwnvblf1g/image/upload/v1746338190/placeholder_aanaig.png';

  const product = await Product.create({
    imageUrl,
    imagePublicId,
    product_code,
    product_name,
    description,
    quantity,
    place
  });

  res.status(201).json(product);
});

const getProducts = asyncHandler(async (req, res) => {
  const products = await Product.find();
  res.status(200).json(products);
});

const getProduct = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) throwError('Barang tidak tersedia!', 400);

  res.status(200).json(product);
});

const removeProduct = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) throwError('Barang tidak tersedia!', 400);

  if (product.imagePublicId) {
    await cloudinary.uploader.destroy(product.imagePublicId);
  } else {
    throwError('Image public id tidak valid!', 400);
  }

  await Product.findByIdAndDelete(req.params.id);
  res.status(200).json({ message: 'Barang berhasil dihapus.' });
});

const updateProduct = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { product_code, product_name, description, quantity, place } = req.body;

  const product = await Product.findById(id);
  if (!product) throwError('Barang tidak ditemukan!', 404);

  let imageUrl = product.imageUrl;
  let imagePublicId = product.imagePublicId;

  if (req.file) {
    if (imagePublicId) {
      await cloudinary.uploader.destroy(imagePublicId);
    }

    imageUrl = req.file.path;
    imagePublicId = req.file.filename;
  }

  product.product_code = product_code || product.product_code;
  product.product_name = product_name || product.product_name;
  product.description = description || product.description;
  product.quantity = quantity || product.quantity;
  product.place = place || product.place;
  product.imageUrl = imageUrl;
  product.imagePublicId = imagePublicId;

  await product.save();
  res.status(200).json(product);
});

module.exports = {
  addProduct,
  getProducts,
  getProduct,
  removeProduct,
  updateProduct
};
