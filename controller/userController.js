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

// // Email & Username

// const userLogin = asyncHandler(async (req, res) => {
//   const { login, password } = req.body; // login = username/email

//   if (!login || !password) {
//     return res.status(400).json({ message: 'All fields are mandatory!' });
//   }

//   const isEmail = login.includes('@');

//   const user = await User.findOne(
//     isEmail ? { email: login } : { username: login }
//   );

//   if (!user) {
//     return res.status(401).json({ message: 'Invalid credentials' });
//   }

//   const isPasswordValid = await bcrypt.compare(password, user.password);

//   if (!isPasswordValid) {
//     return res.status(401).json({ message: 'Invalid credentials' });
//   }

//   const accessToken = jwt.sign(
//     {
//       user: {
//         id: user._id,
//         email: user.email
//       }
//     },
//     process.env.ACCESS_TOKEN_SECRET,
//     { expiresIn: '1h' }
//   );

//   res.status(200).json({ accessToken });
// });

// Email only
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
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }
  res.status(200).json(user);
});

module.exports = { registerUser, userLogin, getCurrentUser };
