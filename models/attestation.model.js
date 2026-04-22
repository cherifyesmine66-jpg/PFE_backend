const mongoose = require('mongoose');

const workflowHistoryEntrySchema = new mongoose.Schema(
    {
        fromState: { type: String, required: true },
        toState:   { type: String, required: true },
        action:    { type: String, required: true },
        actorId:   { type: mongoose.Schema.Types.ObjectId, ref: 'users', required: true },
        actorRole: { type: String },
        comment:   { type: String },
        timestamp: { type: Date, default: Date.now }
    },
    { _id: false }
);

const ATTESTATION_STATES = {
    SUBMITTED:   'SUBMITTED',
    PENDING_DRH: 'PENDING_DRH',
    PENDING_RH:  'PENDING_RH',
    APPROVED:    'APPROVED',
    REJECTED:    'REJECTED',
    CANCELLED:   'CANCELLED',
};

const attestationSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'users',
            required: true,
        },
        attestationType: {
            type: String,
            enum: ['WORK', 'SALARY'],
            required: true,
        },
        purpose: {
            type: String,
            maxlength: 500,
            default: null,
        },
        status: {
            type: String,
            enum: Object.values(ATTESTATION_STATES),
            default: ATTESTATION_STATES.PENDING_DRH,
        },
        currentApproverId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'users',
            default: null,
        },
        decisionNote: {
            type: String,
            maxlength: 500,
            default: null,
        },
        pdfFilename: {
            type: String,
            default: null,
        },
        workflowHistory: [workflowHistoryEntrySchema],
    },
    { timestamps: true }
);

const AttestationModel = mongoose.model('Attestation', attestationSchema);

module.exports = AttestationModel;
module.exports.ATTESTATION_STATES = ATTESTATION_STATES;
