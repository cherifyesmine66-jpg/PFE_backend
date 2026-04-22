const mongoose = require('mongoose');

// ─── Resource Workflow: Employee → DRH → RH ───

const RESOURCE_STATES = {
    SUBMITTED: 'SUBMITTED',
    PENDING_DRH: 'PENDING_DRH',
    PENDING_RH: 'PENDING_RH',
    APPROVED: 'APPROVED',
    REJECTED: 'REJECTED',
    CANCELLED: 'CANCELLED',
};

const RESOURCE_TERMINAL = [RESOURCE_STATES.APPROVED, RESOURCE_STATES.REJECTED, RESOURCE_STATES.CANCELLED];

const workflowHistoryEntrySchema = new mongoose.Schema(
    {
        fromState: { type: String, required: true },
        toState: { type: String, required: true },
        action: { type: String, required: true },
        actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'users', required: true },
        actorRole: { type: String },
        comment: { type: String },
        details: { type: mongoose.Schema.Types.Mixed },
        timestamp: { type: Date, default: Date.now }
    },
    { _id: false }
);

const resourceRequestSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'users',
            required: true
        },
        resourceId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Resource'
        },
        resourceType: {
            type: String,
            required: true,
            trim: true
        },
        description: {
            type: String,
            trim: true
        },
        status: {
            type: String,
            enum: Object.values(RESOURCE_STATES),
            default: RESOURCE_STATES.SUBMITTED
        },
        currentApproverId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'users'
        },
        decisionNote: {
            type: String
        },
        approverId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'users'
        },
        decisionAt: {
            type: Date
        },
        workflowHistory: [workflowHistoryEntrySchema]
    },
    { timestamps: true }
);

const ResourceRequestModel = mongoose.model('ResourceRequest', resourceRequestSchema);

module.exports = ResourceRequestModel;
module.exports.RESOURCE_STATES = RESOURCE_STATES;
module.exports.RESOURCE_TERMINAL = RESOURCE_TERMINAL;
