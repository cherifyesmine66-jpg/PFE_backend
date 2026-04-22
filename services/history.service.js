const { saveLog } = require('../utils/logger');


class HistoryService {
    constructor(workflowService) {
        this.workflowService = workflowService;
        this._bind();
    }

    _bind() {
        this.workflowService.on('transition', (data) => this._onTransition(data));
    }

    async _onTransition({ leave, fromState, toState, action, actor }) {
        try {
            const LogModel = require('../models/log-model');
            const log = new LogModel({
                action: `WORKFLOW:${action} — ${fromState} → ${toState}`,
                actorId: actor._id,
                targetId: leave._id,
                oldState: fromState,
                newState: toState,
                details: {
                    leaveId: leave._id,
                    userId: leave.userId,
                    days: leave.days,
                },
            });
            await log.save();
        } catch (err) {
            console.error('[HistoryService] audit log failed:', err.message);
        }
    }
}

module.exports = HistoryService;
