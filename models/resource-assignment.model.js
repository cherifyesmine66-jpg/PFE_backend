const mongoose = require('mongoose');

const resourceAssignmentSchema = new mongoose.Schema(
    {
        requestId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'ResourceRequest',
            required: true
        },
        resourceId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Resource',
            required: true
        },
        assignedTo: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'users',
            required: true
        },
        assignedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'users',
            required: true
        },
        assignedAt: {
            type: Date,
            default: Date.now
        },
        resourceName: {
            type: String,
            required: true
        },
        resourceCategory: {
            type: String,
            required: true
        },
        note: {
            type: String
        }
    },
    { timestamps: true }
);

const ResourceAssignmentModel = mongoose.model('ResourceAssignment', resourceAssignmentSchema);
module.exports = ResourceAssignmentModel;
