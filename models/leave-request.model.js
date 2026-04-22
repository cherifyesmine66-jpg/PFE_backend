const mongoose = require('mongoose');

const workflowHistoryEntrySchema = new mongoose.Schema(
    {
        fromState: { type: String, required: true },
        toState: { type: String, required: true },
        action: { type: String, required: true },
        actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'users', required: true },
        comment: { type: String },
        modifiedFields: { type: mongoose.Schema.Types.Mixed },
        timestamp: { type: Date, default: Date.now }
    },
    { _id: false }
);

const leaveRequestSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'users',
            required: true
        },
        typeId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'LeaveType',
            required: true
        },
        managerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'users'
        },
        startDate: {
            type: Date,
            required: true
        },
        endDate: {
            type: Date,
            required: true
        },
        days: {
            type: Number,
            required: true
        },
        status: {
            type: String,
            enum: [
                'SUBMITTED',
                'PENDING_MANAGER',
                'PENDING_SERVICE_HEAD',
                'PENDING_DIRECTION',
                'PENDING_DIRECTOR',
                'PENDING_DRH',
                'PENDING_RH',
                'TEMP_MODIFIED',
                'WAITING_EMPLOYEE_RESPONSE',
                'APPROVED',
                'REJECTED',
                'CANCELLED'
            ],
            default: 'SUBMITTED'
        },
        reason: {
            type: String
        },
        attachment: {
            type: String
        },
        certificateRequired: {
            type: Boolean,
            default: false
        },
        certificateUploadedAt: {
            type: Date
        },
        approverId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'users'
        },
        decisionNote: {
            type: String
        },
        decisionAt: {
            type: Date
        },
        // ── Workflow tracking fields ──
        currentApproverId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'users'
        },
        resumeAtState: {
            type: String
        },
        // Modification proposal fields
        modifiedDays: { type: Number },
        modifiedStartDate: { type: Date },
        modifiedEndDate: { type: Date },
        // Original values (stored on first modification)
        originalDays: { type: Number },
        originalStartDate: { type: Date },
        originalEndDate: { type: Date },
        // Embedded audit trail
        workflowHistory: [workflowHistoryEntrySchema]
    },
    { timestamps: true }
);

const LeaveRequestModel = mongoose.model('LeaveRequest', leaveRequestSchema);
module.exports = LeaveRequestModel;
