const { workflowService } = require('./workflow.service');
const HistoryService = require('./history.service');
const NotificationService = require('./notification.service');

// Wire event listeners once at startup
const historyService = new HistoryService(workflowService);
const notificationService = new NotificationService(workflowService);

module.exports = {
    workflowService,
    historyService,
    notificationService,
};
