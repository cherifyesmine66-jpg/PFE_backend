const mongoose = require('mongoose');

const leaveBalanceSchema = new mongoose.Schema(
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
        accrued: {
            type: Number,
            default: 0
        },
        used: {
            type: Number,
            default: 0
        },
        available: {
            type: Number,
            default: 0
        },
        lastAccruedAt: {
            type: Date
        }
    },
    { timestamps: true }
);

leaveBalanceSchema.index({ userId: 1, typeId: 1 }, { unique: true });

const LeaveBalanceModel = mongoose.model('LeaveBalance', leaveBalanceSchema);
module.exports = LeaveBalanceModel;
