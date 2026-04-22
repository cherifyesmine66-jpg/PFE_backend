const express = require('express');
const { protect } = require('../middlewares/auth.middleware');
const {
    listHolidays,
    createHoliday,
    deleteHoliday
} = require('../Controllers/holidays.controller');

const router = express.Router();

router.get('/', protect, listHolidays);
router.post('/', protect, createHoliday);
router.delete('/:id', protect, deleteHoliday);

module.exports = router;
