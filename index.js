const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const dotenv = require('dotenv').config();

const connectDb = require('./config/dbConnection');
const errorHandler = require('./middleware/errorHandler');
const socketController = require('./controller/socket/socketController');

const app = express();
const port = process.env.PORT || 3001;

// DB
connectDb();

// CORS
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
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    credentials: true // wajib untuk cookie
  })
);

// Proxy & parsers
app.set('trust proxy', 1); // penting di hosting reverse proxy (Railway/Render)
app.use(express.json());
app.use(cookieParser());

// Static
app.use('/assets', express.static(path.join(__dirname, 'public/assets')));

// Routes
app.use('/auth', require('./routes/authRouter')); // kalau ada
app.use('/orders', require('./routes/orderRouter')); // kalau ada
app.use('/users', require('./routes/userRouter'));

app.use('/admin/products', require('./routes/admin/productRouter'));
app.use('/comments', require('./routes/commentRouter'));
app.use('/admin/employees', require('./routes/admin/employeeRouter'));
app.use('/admin/warehouses', require('./routes/admin/warehouseRouter'));
app.use('/admin/vendors', require('./routes/admin/vendorRouter'));
app.use('/admin/clients', require('./routes/admin/clientRouter'));
app.use('/admin/loans', require('./routes/admin/loanRouter'));
app.use('/admin/shelves', require('./routes/admin/shelfRouter'));
app.use('/admin/projects', require('./routes/admin/projectRouter'));
app.use('/admin/staffs', require('./routes/admin/staffRouter'));
app.use('/admin/showcases', require('./routes/admin/showcaseRouter'));
app.use('/admin/dashboard', require('./routes/admin/adminDashboardRouter'));
app.use(
  '/admin/loan-circulation',
  require('./routes/admin/loanCirculationRouter')
);
app.use(
  '/admin/product-circulation',
  require('./routes/admin/productCirculationRouter')
);

// Debug cookies (opsional)
app.get('/debug/cookies', (req, res) => res.json(req.cookies));

// Error handler
app.use(errorHandler);

// Socket
const server = http.createServer(app);
socketController(server);

// Start
server.listen(port, () => {
  console.log(`Server is running at port : ${port}`);
});
