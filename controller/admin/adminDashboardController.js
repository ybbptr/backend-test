const asyncHandler = require('express-async-handler');
const throwError = require('../../utils/throwError');

const Product = require('../../model/productModel');
const Inventory = require('../../model/inventoryModel');
const Loan = require('../../model/loanModel');
const ReturnLoan = require('../../model/returnLoanModel');
const RAP = require('../../model/rapModel');
const ProgressProject = require('../../model/progressProjectModel');
const Client = require('../../model/clientModel');
const Vendor = require('../../model/vendorModel');
const Employee = require('../../model/employeeModel');
const Warehouse = require('../../model/warehouseModel');
const Staff = require('../../model/staffModel');
const Showcase = require('../../model/showcaseModel');
const Shelf = require('../../model/shelfModel');
const LoanCirculation = require('../../model/loanCirculationModel');
const ProductCirculation = require('../../model/productCirculationModel');
const ExpenseRequest = require('../../model/expenseRequestModel');
const PvReport = require('../../model/pvReportModel');
const UserManagement = require('../../model/userModel');
const StockLog = require('../../model/stockAdjustmentModel');
const ExpenseLog = require('../../model/expenseLogModel');
const ProfitReport = require('../../model/profitReportModel');

const getAdminDashboard = asyncHandler(async (req, res) => {
  try {
    const [
      clientsCount,
      progressProjectsCount,
      productsCount,
      inventoriesCount,
      vendorsCount,
      employeesCount,
      warehousesCount,
      loansCount,
      returnLoansCount,
      shelvesCount,
      loanCirculationsCount,
      productCirculationsCount,
      showcasesCount,
      staffsCount,
      rapCount,
      expenseRequestsCount,
      pvReportsCount,
      usersCount,
      stockLogsCount,
      expenseLogsCount,
      profitReportsCount
    ] = await Promise.all([
      Client.countDocuments(),
      ProgressProject.countDocuments(),
      Product.countDocuments(),
      Inventory.countDocuments(),
      Vendor.countDocuments(),
      Employee.countDocuments(),
      Warehouse.countDocuments(),
      Loan.countDocuments(),
      ReturnLoan.countDocuments(),
      Shelf.countDocuments(),
      LoanCirculation.countDocuments(),
      ProductCirculation.countDocuments(),
      Showcase.countDocuments(),
      Staff.countDocuments(),
      RAP.countDocuments(),
      ExpenseRequest.countDocuments(),
      PvReport.countDocuments(),
      UserManagement.countDocuments(),
      StockLog.countDocuments(),
      ExpenseLog.countDocuments(),
      ProfitReport.countDocuments()
    ]);

    res.status(200).json({
      clients: clientsCount,
      projects: progressProjectsCount,
      products: productsCount,
      inventories: inventoriesCount,
      vendors: vendorsCount,
      employees: employeesCount,
      warehouses: warehousesCount,
      loans: loansCount,
      return_loans: returnLoansCount,
      shelves: shelvesCount,
      loan_circulations: loanCirculationsCount,
      product_circulations: productCirculationsCount,
      showcases: showcasesCount,
      staffs: staffsCount,
      rap: rapCount,
      expense_requests: expenseRequestsCount,
      pv_reports: pvReportsCount,
      users: usersCount,
      stock_logs: stockLogsCount,
      expense_logs: expenseLogsCount,
      profit_reports: profitReportsCount
    });
  } catch (err) {
    console.error(err);
    throwError('Gagal mengambil data dashboard', 500);
  }
});

module.exports = { getAdminDashboard };
