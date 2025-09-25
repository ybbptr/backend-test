const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const connectDb = require('./config/dbConnection');
const errorHandler = require('./middleware/errorHandler');
const validateToken = require('./middleware/validations/validateTokenHandler');
const socketController = require('./controller/socket/socketController');

const app = express();
const port = process.env.PORT || 3001;

// ---------- DB ----------
connectDb();

// ---------- CORS ----------
const allowedOrigins = [
  process.env.FRONTEND_URL || 'https://soilab-app.vercel.app',
  'http://localhost:5173'
];

app.use(
  cors({
    origin(origin, cb) {
      if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
      return cb(new Error('Not allowed by CORS: ' + origin));
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'requiresAuth'
    ],
    credentials: true
  })
);
app.options('*', cors());

// ---------- App setup ----------
app.set('trust proxy', 1);
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

// Static assets
app.use('/assets', express.static(path.join(__dirname, 'public/assets')));

// ---------------- PUBLIC ROUTES ----------------
app.use('/auth', require('./routes/authRouter'));
app.use('/admin/staffs', require('./routes/admin/staffRouter'));
app.use('/admin/showcases', require('./routes/admin/showcaseRouter'));
app.use('/users', require('./routes/userRouter')); // campuran public/protected di dalam router ini

// ---------------- PROTECTED ROUTES (global) ----------------
app.use(validateToken);

// (bisnis)
app.use('/orders', require('./routes/orderRouter'));
app.use('/expense-request', require('./routes/expenseRequestRouter'));
app.use('/loans', require('./routes/loanRouter'));
app.use('/return-loan', require('./routes/returnLoanRouter'));
app.use('/expense-report', require('./routes/pvReportRouter'));
app.use('/progress-project', require('./routes/progressProjectRouter'));
app.use('/announcement', require('./routes/announcementRouter'));

app.use('/admin/backup', require('./routes/admin/backupRouter'));
app.use('/admin/products', require('./routes/admin/productRouter'));
app.use('/admin/employees', require('./routes/admin/employeeRouter'));
app.use('/admin/warehouses', require('./routes/admin/warehouseRouter'));
app.use('/admin/vendors', require('./routes/admin/vendorRouter'));
app.use('/admin/clients', require('./routes/admin/clientRouter'));
app.use('/admin/inventory', require('./routes/admin/inventoryRouter'));
app.use('/admin/stock-log', require('./routes/admin/stockAdjustmentRouter'));
app.use('/admin/profit-report', require('./routes/admin/profitReportRouter'));
app.use('/admin/expense-log', require('./routes/admin/expenseLogRouter'));
app.use('/admin/project-cost', require('./routes/admin/rapRouter'));
app.use('/admin/shelves', require('./routes/admin/shelfRouter'));
app.use('/admin/dashboard', require('./routes/admin/adminDashboardRouter'));
app.use(
  '/admin/user-management',
  require('./routes/admin/userManagementRouter')
);
app.use(
  '/admin/loan-circulation',
  require('./routes/admin/loanCirculationRouter')
);
app.use(
  '/admin/product-circulation',
  require('./routes/admin/productCirculationRouter')
);

app.use('/employee/projects', require('./routes/employee/dailyProgressRouter'));
app.use('/employee/profile', require('./routes/employee/editProfileRouter'));

// ---------- CHAT ROUTES (protected) ----------
app.use('/chat', require('./routes/chatRouter'));

app.use(errorHandler);

const server = http.createServer(app);
socketController(server);

server.listen(port, () => {
  console.log(`Server is running at port : ${port}`);
});
