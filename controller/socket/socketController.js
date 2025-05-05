const { Server } = require('socket.io');
const Message = require('../../model/chatModel');
const socketToken = require('../../middleware/socketToken');
const userSocket = require('./userSocket');
const adminSocket = require('./adminSocket');

const socketController = (server) => {
  const io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  });

  io.use(socketToken);

  io.on('connection', (socket) => {
    const user = socket.user;
    socket.join(user.id);

    if (user.role === 'admin') {
      adminSocket(io, socket);
    } else {
      userSocket(io, socket);
    }

    socket.on('sendMsg', async ({ receiver, message }) => {
      try {
        const newMsg = new Message({
          sender: user.id,
          receiver: receiver,
          message: message,
          timestamp: new Date()
        });

        await newMsg.save();
        console.log('Message saved : ' + newMsg);

        io.to(receiver).emit('receiveMessage', {
          sender: user.name,
          message: message
        });
      } catch (error) {
        console.error('Message not saved');
      }
    });

    socket.on('disconnect', () => {
      console.log(`❌ Disconnected: ${socket.id}`);
    });
  });
};

module.exports = socketController;
