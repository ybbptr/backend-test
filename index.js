const express = require('express');
const connectDb = require('./config/dbConnection');
const errorHandler = require('./middleware/errorHandler');
const app = express();
const dotenv = require('dotenv').config();

const port = process.env.PORT || 3000;

connectDb();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/api/comments', require('./routes/commentRouter'));
app.use(errorHandler);

app.listen(port, () => {
  console.log(`Server is running at port : ${port}`);
});
