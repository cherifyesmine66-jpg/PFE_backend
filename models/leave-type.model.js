const mongoose = require('mongoose');

const leaveTypeSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true
        },
        code: {
            type: String,
            required: true,
            unique: true,
            uppercase: true,
            trim: true
        },
        paid: {
            type: Boolean,
            default: true
        },
        monthlyAccrual: {
            type: Number,
            default: 0,
            min: 0
        },
        requiresCertificateAfterDays: {
            type: Number,
            default: null
        },
        isActive: {
            type: Boolean,
            default: true
        }
    },
    { timestamps: true }
);

const LeaveTypeModel = mongoose.model('LeaveType', leaveTypeSchema);
module.exports = LeaveTypeModel;
