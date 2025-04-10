const express = require('express');
const connectDb = require('./config/dbConnection');
const errorHandler = require('./middleware/errorHandler');
const app = express();
const dotenv = require('dotenv').config();
const cors = require('cors');
const path = require('path');

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
app.use(errorHandler);

app.listen(port, () => {
  console.log(`Server is running at port : ${port}`);
});
