const { constants } = require('../constants');

const errorHandler = (err, req, res, next) => {
  const statusCode =
    res.statusCode && res.statusCode !== 200
      ? res.statusCode
      : constants.SERVER_ERROR;

  let title;

  switch (statusCode) {
    case constants.VALIDATION_ERROR:
      title = 'Validation Failed';
      break;
    case constants.UNAUTHORIZED:
      title = 'Unauthorized';
      break;
    case constants.FORBIDDEN:
      title = 'Forbidden';
      break;
    case constants.NOT_FOUND:
      title = 'Not Found';
      break;
    case constants.SERVER_ERROR:
      title = 'Server Error';
      break;
    default:
      title = 'Unexpected Error';
      break;
  }

  res.status(statusCode).json({
    success: false,
    title,
    message: err.message || 'Something went wrong',
    stackTrace: process.env.NODE_ENV === 'production' ? null : err.stack
  });
};

module.exports = errorHandler;
