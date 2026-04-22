const logModel = require('../models/log-model');
const userModel = require('../models/user.model');

async function getLogs(req, res) {
    try {
        let query = {};

        const isAdmin = req.user.role === 'RH';
        const isManager = ['ChefDeService', 'Direction', 'DirectionGenerale', 'DRH'].includes(req.user.role);

        if (!isAdmin && !isManager) {
            // Employee: own logs only
            query.actorId = req.user._id;
        } else if (isManager) {
            const teamMembers = await userModel.find({ managerId: req.user._id }, '_id').lean();
            const ids = [req.user._id, ...teamMembers.map((u) => u._id)];
            query.actorId = { $in: ids };
        }
        // RH: no filter — sees all logs

        const logs = await logModel
            .find(query)
            .populate('actorId', 'firstName lastName')
            .sort({ createdAt: -1 });
        res.status(200).json({ logs });
    } catch (error) {
        console.log(error.message);
        res.status(500).json({
            status: false,
            message: "Erreur interne du serveur",
        });
    }
}
async function getLogByActorId(req, res) {
    try {
        const targetId = req.params.id;

        if (req.user.role === 'Employee' && String(req.user._id) !== targetId) {
            return res.status(403).json({ status: false, message: 'Non autorisé' });
        }

        const isManager = ['ChefDeService', 'Direction', 'DirectionGenerale', 'DRH'].includes(req.user.role);
        if (isManager && String(req.user._id) !== targetId) {
            const isMember = await userModel.exists({ _id: targetId, managerId: req.user._id });
            if (!isMember) {
                return res.status(403).json({ status: false, message: 'Non autorisé' });
            }
        }

        const log = await logModel
            .find({ actorId: targetId })
            .populate('actorId', 'firstName lastName')
            .sort({ createdAt: -1 });
        res.status(200).json({ log });
    } catch (error) {
        console.log(error.message);
        res.status(500).json({
                status: false,
            message: "Erreur interne du serveur",
        });
    }
}

module.exports = {
    getLogs,
    getLogByActorId
};