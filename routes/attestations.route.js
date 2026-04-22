const express = require('express');
const { protect } = require('../middlewares/auth.middleware');
const {
    createAttestationRequest,
    listMyAttestations,
    listPendingAttestations,
    forwardAttestationRequest,
    rejectAttestationRequest,
    generateAttestation,
    cancelAttestationRequest
} = require('../Controllers/attestations.controller');

const router = express.Router();

// Employee requests
router.post('/request', protect, createAttestationRequest);
router.get('/my', protect, listMyAttestations);

// DRH / RH pending list
router.get('/pending', protect, listPendingAttestations);

// Workflow actions
router.put('/:id/forward', protect, forwardAttestationRequest);   // DRH → RH
router.put('/:id/reject', protect, rejectAttestationRequest);     // DRH or RH
router.put('/:id/generate', protect, generateAttestation);        // RH generates PDF
router.put('/:id/cancel', protect, cancelAttestationRequest);     // Employee

module.exports = router;
