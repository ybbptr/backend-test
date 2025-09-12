const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const dotenv = require('dotenv').config();

const connectDb = require('./config/dbConnection');
const errorHandler = require('./middleware/errorHandler');
const validateToken = require('./middleware/validations/validateTokenHandler');
const socketController = require('./controller/socket/socketController');

const app = express();
const port = process.env.PORT || 3001;

connectDb();

// CORS setup
const allowedOrigins = [
  'https://soilab-app.vercel.app',
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

app.set('trust proxy', 1);
app.use(express.json());
app.use(cookieParser());

// Static assets
app.use('/assets', express.static(path.join(__dirname, 'public/assets')));

// ---------------- PUBLIC ROUTES ---------------- //
app.use('/auth', require('./routes/authRouter'));
app.use('/admin/staffs', require('./routes/admin/staffRouter'));
app.use('/admin/showcases', require('./routes/admin/showcaseRouter'));
app.use('/users', require('./routes/userRouter')); // router ini handle campuran public & protected
app.use('/admin/inventory', require('./routes/admin/inventoryRouter'));

// ---------------- PROTECTED ROUTES (global) ---------------- //
app.use(validateToken);

app.use('/orders', require('./routes/orderRouter'));
app.use('/expense-request', require('./routes/expenseRequestRouter'));
app.use('/loans', require('./routes/loanRouter'));
app.use('/return-loan', require('./routes/returnLoanRouter'));

app.use('/admin/products', require('./routes/admin/productRouter'));
app.use('/admin/employees', require('./routes/admin/employeeRouter'));
app.use('/admin/warehouses', require('./routes/admin/warehouseRouter'));
app.use('/admin/vendors', require('./routes/admin/vendorRouter'));
app.use('/admin/clients', require('./routes/admin/clientRouter'));
// app.use('/admin/inventory', require('./routes/admin/inventoryRouter'));
app.use('/admin/project-cost', require('./routes/admin/rapRouter'));
app.use('/admin/shelves', require('./routes/admin/shelfRouter'));
app.use('/admin/projects', require('./routes/admin/projectRouter'));
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

// Error handler
app.use(errorHandler);

// Socket.io
const server = http.createServer(app);
socketController(server);

server.listen(port, () => {
  console.log(`Server is running at port : ${port}`);
});
