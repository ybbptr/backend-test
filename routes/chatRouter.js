const express = require('express');
const router = express.Router();
const {
  createConversation,
  getMessages,
  listConversations,
  openCustomerChat,
  updateConversation,
  updateMembers,
  getContacts,
  listPinnedMessages,
  pinMessage,
  unpinMessage,
  getConversationMedia,
  getConversationLinks,
  deleteConversation,
  getMessagesAround,
  searchMessagesGlobal,
  searchMessagesInConversation,
  deleteMessage
} = require('../controller/chatController');
const up = require('../controller/socket/chatUploadController');

router.post('/attachments', up.multerUpload.array('files', 5), up.handleUpload);
router.get('/attachments/url', up.getSignedUrl);
router.delete('/attachments', up.deleteAttachment);
router.get('/contacts', getContacts);
router.get('/conversations', listConversations);
router.post('/conversations', createConversation);
router.get('/search', searchMessagesGlobal);

router.post('/customer/open', openCustomerChat);

router.get('/conversations/:id/search', searchMessagesInConversation);
router.get('/conversations/:id/messages/around', getMessagesAround);
router.get('/conversations/:id/links', getConversationLinks);
router.get('/conversations/:id/media', getConversationMedia);
router.get('/conversations/:id/pins', listPinnedMessages);

router.post('/conversations/:id/pin', pinMessage);
router.delete('/conversations/:id/pin/:messageId', unpinMessage);

router.patch('/conversations/:id', updateConversation);
router.delete('/conversations/delete/:id', deleteConversation);
router.delete('/message/delete/:id', deleteMessage);
router.patch('/conversations/:id/members', updateMembers);

router.get('/conversations/:id/messages', getMessages);

module.exports = router;
