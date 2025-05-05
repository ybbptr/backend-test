const adminSocket = (io, socket) => {
  console.log('Admin is now online');

  socket.on('sendToUser', ({ receiverId, message }) => {
    io.to(receiverId).emit('receiveMessage', {
      sender: 'Admin',
      message
    });
    console.log(`📤 Admin sent message to ${receiverId}: ${message}`);
  });

  socket.on('getOnlineUsers', () => {
    // logic ambil list user online bisa ditambah nanti
  });
};

module.exports = adminSocket;
