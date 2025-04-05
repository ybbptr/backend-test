const { constants } = require('../constants');

const statusTitles = {
  [constants.VALIDATION_ERROR]: 'Validation Failed',
  [constants.UNAUTHORIZED]: 'Unauthorized',
  [constants.FORBIDDEN]: 'Forbidden',
  [constants.NOT_FOUND]: 'Not Found',
  [constants.SERVER_ERROR]: 'Server Error'
};

const errorHandler = (err, req, res, next) => {
  const statusCode =
    err.statusCode ||
    (res.statusCode && res.statusCode !== 200
      ? res.statusCode
      : constants.SERVER_ERROR);

  const title = err.title || statusTitles[statusCode] || 'Unexpected Error';

  res.status(statusCode).json({
    success: false,
    title,
    message: err.message || 'Something went wrong',
    field: err.field || null,
    stackTrace: process.env.NODE_ENV === 'production' ? null : err.stack
  });
};

module.exports = errorHandler;
