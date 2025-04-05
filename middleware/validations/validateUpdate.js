const Joi = require('joi');

const validateUpdate = (req, res, next) => {
  const schema = Joi.object({
    email: Joi.string()
      .email({ tlds: { allow: false } })
      .messages({
        'string.email': 'Email must be a valid email address',
        'any.required': 'Email is required'
      }),

    name: Joi.string().min(3).messages({
      'string.min': 'Name must be at least 3 characters',
      'any.required': 'Name is required'
    }),

    phone: Joi.string()
      .pattern(/^[0-9]{10,15}$/)
      .messages({
        'string.pattern.base':
          'Phone must be a valid number with 10 to 15 digits',
        'any.required': 'Phone number is required'
      })
  }).min(1);

  const { error } = schema.validate(req.body);
  if (error) {
    return res.status(400).json({ message: error.details[0].message });
  }
  next();
};

module.exports = validateUpdate;
