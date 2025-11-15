const Joi = require('joi');

// User validation schema (Register/Create)
const userSchema = Joi.object({
  username: Joi.string().min(3).max(30).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
  age: Joi.number().integer().min(1).max(150).optional(),
  role: Joi.string().valid('admin', 'user', 'moderator').optional()
});

// User update validation schema (all fields optional)
// Kita sesuaikan juga agar bisa update username/password jika perlu
const userUpdateSchema = Joi.object({
  username: Joi.string().min(3).max(30).optional(),
  email: Joi.string().email().optional(),
  password: Joi.string().min(6).optional(),
  age: Joi.number().integer().min(1).max(150).optional(),
  role: Joi.string().valid('admin', 'user', 'moderator').optional()
}).min(1); // At least one field must be provided

// Validation middleware for creating users
const validateUser = (req, res, next) => {
  const { error } = userSchema.validate(req.body);
  
  if (error) {
    return res.status(400).json({
      error: 'Validation error',
      message: error.details[0].message,
      details: error.details
    });
  }
  
  next();
};

// Validation middleware for updating users
const validateUserUpdate = (req, res, next) => {
  const { error } = userUpdateSchema.validate(req.body);
  
  if (error) {
    return res.status(400).json({
      error: 'Validation error',
      message: error.details[0].message,
      details: error.details
    });
  }
  
  next();
};

module.exports = {
  validateUser,
  validateUserUpdate
};