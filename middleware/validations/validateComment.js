const Joi = require('joi');

const commentSchema = Joi.object({
  text: Joi.string().min(5).required().trim().messages({
    'string.min': 'Komentar minimal terdiri dari 5 karakter',
    'any.required': 'Komentar wajib diisi',
    'string.empty': 'Komentar tidak boleh kosong'
  })
});

module.exports = commentSchema;
