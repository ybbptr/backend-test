const asyncHandler = require('express-async-handler');
const User = require('../model/userModel');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const registerUser = asyncHandler(async (req, res) => {
  const { email, name, phone, password } = req.body || {};
  if (!email || !password || !name || !phone) {
    res.status(400);
    throw new Error('All fields are mandatory!');
  }

  const userExist = await User.findOne({ email });
  if (userExist) {
    res.status(400);
    throw new Error('User already registered!');
  }

  // Hashing password
  const hashedPassword = await bcrypt.hash(password, 10);

  // Create user
  const user = await User.create({
    name,
    email,
    phone,
    password: hashedPassword
  });

  // Checking if user is valid
  if (!user) {
    res.status(400);
    throw new Error('User data is not valid!');
  } else {
    res.status(201).json({
      _id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone
    });
  }
});

const userLogin = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: 'All fields are mandatory!' });
  }

  const user = await User.findOne({ email });
  console.log(user);
  // Compare password with hashedpassword
  const isPasswordValid =
    user && (await bcrypt.compare(password, user.password));

  if (isPasswordValid) {
    const accessToken = jwt.sign(
      {
        user: {
          email: user.email,
          id: user.id
        }
      },
      process.env.ACCESS_TOKEN_SECRET,
      { expiresIn: '1h' }
    );
    return res.status(200).json({ accessToken });
  } else {
    return res.status(401).json({ message: 'Invalid credentials' });
  }
});

const getCurrentUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id).select('-password');
  console.log(req.user);

  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }
  res.status(200).json(user);
});

const updateUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id).select('-password');
  if (!user) {
    res.status(404);
    throw new Error('User not found!');
  }

  const { name, email, phone } = req.body || {};
  if (!name && !email && !phone) {
    return res
      .status(400)
      .json({ message: 'At least one field must be provided to update' });
  }

  // Build object update
  const updatedFields = {};
  if (name) updatedFields.name = name;
  if (email) updatedFields.email = email;
  if (phone) updatedFields.phone = phone;

  if (email) {
    const userExist = await User.findOne({ email });
    if (userExist && userExist.id !== user.id) {
      res.status(400);
      throw new Error('This email is not available!');
    }
  }

  const updatedUser = await User.findByIdAndUpdate(user.id, updatedFields, {
    new: true,
    runValidators: true
  }).select('-password');
  res.status(200).json({
    message: 'Sucessfully updated',
    user: updatedUser
  });
});

module.exports = { registerUser, userLogin, getCurrentUser, updateUser };
