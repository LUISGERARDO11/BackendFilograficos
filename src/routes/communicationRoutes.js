const express = require('express');
const router = express.Router();
const communicationController = require('../controllers/communicationController');
const authMiddleware = require('../middlewares/authMiddleware');

router.get('/', authMiddleware, communicationController.getCommunicationPreferences);
router.put('/', authMiddleware, communicationController.updateCommunicationPreferences);

module.exports = router;