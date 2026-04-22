const LogModel = require('../models/log-model');

/**
 * @param {string}   action   – Human-readable description
 * @param {ObjectId} actorId  – Who performed the action
 * @param {object}  [extra]   – Optional audit fields
 * @param {string}  [extra.actorRole]
 * @param {ObjectId}[extra.targetId]   – The document affected
 * @param {string}  [extra.targetModel]– e.g. 'ResourceRequest','LeaveRequest'
 * @param {string}  [extra.oldState]
 * @param {string}  [extra.newState]
 * @param {object}  [extra.details]    – Arbitrary payload (stock impact, etc.)
 */
async function saveLog(action, actorId, extra = {}) {
    try {
        const log = new LogModel({
            action,
            actorId,
            ...(extra.actorRole   && { actorRole: extra.actorRole }),
            ...(extra.targetId    && { targetId: extra.targetId }),
            ...(extra.targetModel && { targetModel: extra.targetModel }),
            ...(extra.oldState    && { oldState: extra.oldState }),
            ...(extra.newState    && { newState: extra.newState }),
            ...(extra.details     && { details: extra.details }),
        });
        await log.save();
        return log;
    } catch (error) {
        console.error('Error saving log:', error.message);
        throw new Error('Failed to save log: ' + error.message);
    }
}

module.exports = {
    saveLog
};