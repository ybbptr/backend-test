const asyncHandler = require('express-async-handler');
const throwError = require('../../utils/throwError');
const Client = require('../../model/clientModel');
const ProgressProject = require('../../model/progressProjectModel');
const Product = require('../../model/productModel');
const Vendor = require('../../model/vendorModel');
const Employee = require('../../model/employeeModel');
const Warehouse = require('../../model/warehouseModel');
const Loan = require('../../model/loanModel');
const Staff = require('../../model/staffModel');
const Showcase = require('../../model/showcaseModel');
const Shelf = require('../../model/shelfModel');
const loanCirculationModel = require('../../model/loanCirculationModel');
const productCirculationModel = require('../../model/productCirculationModel');

const getAdminDashboard = asyncHandler(async (req, res) => {
  try {
    const [
      clientsCount,
      progressProjectsCount,
      productsCount,
      vendorsCount,
      employeesCount,
      warehousesCount,
      loansCount,
      shelvesCount,
      loanCirculationsCount,
      productCirculationsCount,
      showcaseCount,
      staffCount
    ] = await Promise.all([
      Client.countDocuments(),
      ProgressProject.countDocuments(),
      Product.countDocuments(),
      Vendor.countDocuments(),
      Employee.countDocuments(),
      Warehouse.countDocuments(),
      Loan.countDocuments(),
      Shelf.countDocuments(),
      loanCirculationModel.countDocuments(),
      productCirculationModel.countDocuments(),
      Showcase.countDocuments(),
      Staff.countDocuments()
    ]);

    res.status(200).json({
      clients: clientsCount,
      progress_project: progressProjectsCount,
      products: productsCount,
      vendors: vendorsCount,
      employees: employeesCount,
      warehouses: warehousesCount,
      loans: loansCount,
      shelves: shelvesCount,
      loan_circulations: loanCirculationsCount,
      product_circulations: productCirculationsCount,
      showcases: showcaseCount,
      staffs: staffCount
    });
  } catch (err) {
    throwError('Gagal mengambil data dashboard', 500);
  }
});

module.exports = { getAdminDashboard };
