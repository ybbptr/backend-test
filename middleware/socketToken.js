const jwt = require('jsonwebtoken');

const socketToken = (socket, next) => {
  try {
    const token = socket.handshake.auth?.token?.split(' ')[1];
    if (!token) return next(new Error('User tidak memiliki akses!'));

    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
      if (err) return next(new Error('Token invalid!'));

      socket.user = decoded.user;
      next();
    });
  } catch (error) {
    next(new Error('Autentikasi gagal!'));
  }
};

module.exports = socketToken;
