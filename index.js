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

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/assets', express.static(path.join(__dirname, 'public/assets')));
app.use('/api/comments', require('./routes/commentRouter'));
app.use('/api/users', require('./routes/userRouter'));
app.use('/api/orders', require('./routes/orderRouter'));
app.use('/admin/products', require('./routes/admin/productRouter'));
app.use(errorHandler);

app.get('/test-chat', (req, res) => {
  res.sendFile(path.join(__dirname, 'test.html'));
});

const server = http.createServer(app);
socketController(server);

server.listen(port, () => {
  console.log(`Server is running at port : ${port}`);
});
