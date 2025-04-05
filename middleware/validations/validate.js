const validate = (schema) => (req, res, next) => {
  const { error } = schema.validate(req.body, { abortEarly: false });
  if (error) {
    const field = error.details[0].path[0];
    const message = error.details[0].message;
    const errObj = new Error(message);
    errObj.statusCode = 400;
    errObj.field = field;
    return next(errObj);
  }
  next();
};

module.exports = validate;
