const mongoose = require('mongoose');

const logSchema = new mongoose.Schema({
    action: {
        type: String,
        required: true
    },
    actorId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'users',
        required: true
    },
    actorRole: {
        type: String
    },
    targetId: {
        type: mongoose.Schema.Types.ObjectId
    },
    targetModel: {
        type: String
    },
    oldState: {
        type: String
    },
    newState: {
        type: String
    },
    details: {
        type: mongoose.Schema.Types.Mixed
    }
}, { timestamps: true });

const LogModel = mongoose.model('Log', logSchema);
module.exports = LogModel;