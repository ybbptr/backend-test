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
  searchMessagesInConversation
} = require('../controller/chatController');
const up = require('../controller/socket/chatUploadController');

router.post('/attachments', up.multerUpload.array('files', 5), up.handleUpload);
router.get('/attachments/url', up.getSignedUrl);
router.delete('/attachments', up.deleteAttachment);
router.get('/contacts', getContacts); // conatct
router.get('/conversations', listConversations); // sidebar
router.post('/conversations', createConversation); // buat direct/group
router.get('/search', searchMessagesGlobal);

router.get('/conversations/:id/search', searchMessagesInConversation);
router.get('/conversations/:id/messages/around', getMessagesAround);
router.get('/conversations/:id/links', getConversationLinks);
router.get('/conversations/:id/media', getConversationMedia);
router.get('/conversations/:id/pins', listPinnedMessages);

router.post('/conversations/:id/pin', pinMessage);
router.delete('/conversations/:id/pin/:messageId', unpinMessage);

router.patch('/conversations/:id', updateConversation); // rename, pin
router.delete('/conversations/delete/:id', deleteConversation); // rename, pin
router.patch('/conversations/:id/members', updateMembers); // tambah/keluarin anggota

router.get('/conversations/:id/messages', getMessages); // riwayat pesan (paging)
router.post('/customer/open', openCustomerChat); // buat chat customer (TTL 24h)

module.exports = router;
