const Joi = require('joi');

const validateComment = (req, res, next) => {
  const schema = Joi.object({
    text: Joi.string().min(5).required().trim()
  });

  const { error } = schema.validate(req.body);
  if (error) {
    return res.status(400).json({ message: error.details[0].message });
  }
  next();
};

module.exports = validateComment;
