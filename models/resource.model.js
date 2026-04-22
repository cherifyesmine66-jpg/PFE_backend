const mongoose = require('mongoose');

const resourceSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true
        },
        category: {
            type: String,
            required: true,
            trim: true
        },
        description: {
            type: String,
            trim: true
        },
        totalQuantity: {
            type: Number,
            required: true,
            min: 0
        },
        availableQuantity: {
            type: Number,
            required: true,
            min: 0
        }
    },
    { timestamps: true }
);

const ResourceModel = mongoose.model('Resource', resourceSchema);
module.exports = ResourceModel;
