const express = require('express');
const router = express.Router();
const {
  createAnnouncement,
  createConversation,
  getMessages,
  listConversations,
  openCustomerChat,
  updateConversation,
  updateMembers,
  getContacts
} = require('../controller/chatController');
const up = require('../controller/socket/chatUploadController');

router.post('/attachments', up.multerUpload.array('files', 5), up.handleUpload);
router.get('/attachments/url', up.getSignedUrl);
router.delete('/attachments', up.deleteAttachment);
router.get('/contacts', getContacts); // conatct
router.get('/conversations', listConversations); // sidebar
router.post('/conversations', createConversation); // buat direct/group
router.patch('/conversations/:id', updateConversation); // rename, pin
router.patch('/conversations/:id/members', updateMembers); // tambah/keluarin anggota

router.get('/conversations/:id/messages', getMessages); // riwayat pesan (paging)
router.post('/customer/open', openCustomerChat); // buat chat customer (TTL 24h)

router.post('/announcement', createAnnouncement); // admin bikin pengumuman

module.exports = router;
