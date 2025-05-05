const userSocket = (io, socket) => {
  console.log(`${socket.user.name} is now online`);

  socket.on('sendToAdmin', ({ message }) => {
    const adminId = 'process.env.ADMIN_USER_ID';
    io.to(adminId).emit('receiveMessage', {
      sender: socket.user.name,
      message
    });
    console.log(`${socket.user.name} sent message to Admin: ${message}`);
  });
};

module.exports = userSocket;
