const asyncHandler = require('express-async-handler');
const throwError = require('../utils/throwError');

const checkDuplicate = (model, fields = []) => {
  return asyncHandler(async (req, res, next) => {
    for (const [field, label] of Object.entries(fields)) {
      const value = req.body[field];
      if (!value) continue;

      const query = { [field]: value };

      if (req.params.id) {
        query._id = { $ne: req.params.id };
      }

      const exists = await model.findOne(query);
      if (exists) {
        throwError(`${label} sudah terdaftar`, 400, field);
      }
    }

    next();
  });
};

module.exports = checkDuplicate;
