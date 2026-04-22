const express = require('express');
const { protect } = require('../middlewares/auth.middleware');
const {
    listResources,
    createResource,
    updateResource,
    deleteResource,
    createResourceRequest,
    listMyRequests,
    listPendingResourceApprovals,
    forwardResourceRequest,
    approveResourceRequest,
    rejectResourceRequest,
    cancelResourceRequest,
    listAssignments
} = require('../Controllers/resources.controller');

const router = express.Router();

// Inventory management (RH write, DRH read)
router.get('/inventory', protect, listResources);
router.post('/inventory', protect, createResource);
router.put('/inventory/:id', protect, updateResource);
router.delete('/inventory/:id', protect, deleteResource);

// Resource requests
router.post('/request', protect, createResourceRequest);
router.get('/my', protect, listMyRequests);
router.get('/pending', protect, listPendingResourceApprovals);

// Workflow actions
router.put('/:id/forward', protect, forwardResourceRequest);   // DRH → RH
router.put('/:id/approve', protect, approveResourceRequest);   // RH only
router.put('/:id/reject', protect, rejectResourceRequest);     // RH only
router.put('/:id/cancel', protect, cancelResourceRequest);     // Employee

// Assignment history (RH)
router.get('/assignments', protect, listAssignments);

module.exports = router;
