const express = require('express');
const { protect } = require('../middlewares/auth.middleware');
const {
    getLeaveTypes,
    getLeaveTypeById,
    createLeaveType,
    updateLeaveType,
    deactivateLeaveType,
    requestLeave,
    listMyLeaves,
    getLeaveBalances,
    listPendingApprovals,
    approveLeave,
    rejectLeave,
    modifyLeave,
    respondToModification,
    cancelLeave,
    uploadLeaveAttachment,
    runAccrualManual,
    listCurrentAbsences,
    getLeaveHistory
} = require('../Controllers/leaves.controller');

const router = express.Router();

// Leave type management
router.get('/types', protect, getLeaveTypes);
router.post('/types', protect, createLeaveType);
router.get('/types/:id', protect, getLeaveTypeById);
router.put('/types/:id', protect, updateLeaveType);
router.delete('/types/:id', protect, deactivateLeaveType);

// Balance and requests
router.get('/balance', protect, getLeaveBalances);
router.post('/request', protect, requestLeave);
router.get('/my', protect, listMyLeaves);
router.get('/pending', protect, listPendingApprovals);
router.get('/absences', protect, listCurrentAbsences);

// Manual accrual trigger (before /:id/* routes to avoid ambiguity)
router.post('/accrual/run', protect, runAccrualManual);

// Per-request workflow actions
router.put('/:id/approve', protect, approveLeave);
router.put('/:id/reject', protect, rejectLeave);
router.put('/:id/modify', protect, modifyLeave);
router.put('/:id/respond', protect, respondToModification);
router.put('/:id/cancel', protect, cancelLeave);
router.post('/:id/attachment', protect, uploadLeaveAttachment);
router.get('/:id/history', protect, getLeaveHistory);

module.exports = router;
