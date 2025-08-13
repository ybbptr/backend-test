const express = require('express');
const http = require('http');
const connectDb = require('./config/dbConnection');
const errorHandler = require('./middleware/errorHandler');
const dotenv = require('dotenv').config();
const cors = require('cors');
const path = require('path');
const socketController = require('./controller/socket/socketController');

const app = express();
const port = process.env.PORT || 3001;

connectDb();

app.set('trust proxy', 1);

const allowedOrigins = [
  'http://localhost:5173',
  'https://soilab-app.vercel.app'
];

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  }
  res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
    optionsSuccessStatus: 200
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/assets', express.static(path.join(__dirname, 'public/assets')));
app.use('/api/comments', require('./routes/commentRouter'));
app.use('/api/users', require('./routes/userRouter'));
app.use('/api/orders', require('./routes/orderRouter'));
app.use('/admin/products', require('./routes/admin/productRouter'));
app.use('/admin/employees', require('./routes/admin/employeeRouter'));
app.use('/admin/warehouses', require('./routes/admin/warehouseRouter'));

app.use(errorHandler);

app.get('/test-chat', (req, res) => {
  res.sendFile(path.join(__dirname, 'test.html'));
});

const server = http.createServer(app);
socketController(server);

server.listen(port, () => {
  console.log(`Server is running at port : ${port}`);
});
