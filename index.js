const express = require('express');
const http = require('http');
const cookieParser = require('cookie-parser');
const connectDb = require('./config/dbConnection');
const errorHandler = require('./middleware/errorHandler');
const dotenv = require('dotenv').config();
const cors = require('cors');
const path = require('path');
const socketController = require('./controller/socket/socketController');

const app = express();
const port = process.env.PORT || 3001;

connectDb();

app.use(
  cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    credentials: true
  })
);

// app.set('trust proxy', 1);
app.use(express.json());
app.use(cookieParser());

app.use('/assets', express.static(path.join(__dirname, 'public/assets')));

app.use('/auth', require('./routes/authRouter'));

app.use('/api/orders', require('./routes/orderRouter'));
app.use('/admin/products', require('./routes/admin/productRouter'));
app.use('/api/comments', require('./routes/commentRouter'));
app.use('/api/users', require('./routes/userRouter'));

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

app.use(
  '/admin/product-circulation',
  require('./routes/admin/productCirculationRouter')
);

app.use(errorHandler);

app.get('/test-chat', (req, res) => {
  res.sendFile(path.join(__dirname, 'test.html'));
});

const server = http.createServer(app);
socketController(server);

server.listen(port, () => {
  console.log(`Server is running at port : ${port}`);
});
