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

app.use(
  cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    credentials: true
  })
);

// app.set('trust proxy', 1);
// app.use(express.urlencoded({ extended: true }));

app.use('/assets', express.static(path.join(__dirname, 'public/assets')));

// Multipart
app.use('/api/orders', require('./routes/orderRouter'));
app.use(
  '/admin/products',
  express.json(),
  require('./routes/admin/productRouter')
);

// Application / JSON
app.use('/api/comments', express.json(), require('./routes/commentRouter'));
app.use('/api/users', express.json(), require('./routes/userRouter'));
app.use(
  '/admin/employees',
  express.json(),
  require('./routes/admin/employeeRouter')
);
app.use(
  '/admin/warehouses',
  express.json(),
  require('./routes/admin/warehouseRouter')
);
app.use(
  '/admin/vendors',
  express.json(),
  require('./routes/admin/vendorRouter')
);
app.use(
  '/admin/clients',
  express.json(),
  require('./routes/admin/clientRouter')
);
app.use('/admin/loans', express.json(), require('./routes/admin/loanRouter'));
app.use(
  '/admin/shelves',
  express.json(),
  require('./routes/admin/shelfRouter')
);
app.use(
  '/admin/loan-circulation',
  express.json(),
  require('./routes/admin/loanCirculationRouter')
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
