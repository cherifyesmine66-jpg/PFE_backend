const express = require('express');
const { getLogs, getLogByActorId } = require('../Controllers/logs.controller');
const router = express.Router();
const { protect } = require('../middlewares/auth.middleware');
router.get('/', protect, getLogs);
router.get('/:id', protect, getLogByActorId);
module.exports = router;