const ResourceModel = require('../models/resource.model');
const ResourceRequestModel = require('../models/resource-request.model');
const { RESOURCE_STATES, RESOURCE_TERMINAL } = require('../models/resource-request.model');
const ResourceAssignmentModel = require('../models/resource-assignment.model');
const userModel = require('../models/user.model');
const sendEmail = require('../utils/mailer');
const { saveLog } = require('../utils/logger');
const {
    createResourceSchema,
    updateResourceSchema,
    createResourceRequestSchema,
    resourceForwardSchema,
    resourceDecisionSchema,
    resourceApprovalSchema
} = require('../schemas/resource.schema');

// ═══════════════════════════════════════════════════════════════════
// ─── Inventory (RH write, DRH read) ────────────────────────────────
// ═══════════════════════════════════════════════════════════════════

const listResources = async (req, res) => {
    try {
        // DRH + RH can view inventory
        if (!['DRH', 'RH'].includes(req.user.role)) {
            return res.status(403).json({ message: 'Non autorisé' });
        }
        const resources = await ResourceModel.find().sort({ category: 1, name: 1 });
        res.status(200).json({ resources });
    } catch (error) {
        res.status(500).json({ message: error.message || 'Erreur interne du serveur' });
    }
};

const createResource = async (req, res) => {
    try {
        if (req.user.role !== 'RH') {
            return res.status(403).json({ message: 'Non autorisé' });
        }
        const validation = createResourceSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({ errors: validation.error.flatten() });
        }
        const resource = new ResourceModel(validation.data);
        await resource.save();

        await saveLog(
            `Ressource "${resource.name}" ajoutée à l'inventaire`,
            req.user._id,
            {
                actorRole: req.user.role,
                targetId: resource._id,
                targetModel: 'Resource',
                newState: 'CREATED',
                details: { resourceName: resource.name, category: resource.category, totalQuantity: resource.totalQuantity, availableQuantity: resource.availableQuantity }
            }
        );
        res.status(201).json({ resource });
    } catch (error) {
        res.status(500).json({ message: error.message || 'Erreur interne du serveur' });
    }
};

const updateResource = async (req, res) => {
    try {
        if (req.user.role !== 'RH') {
            return res.status(403).json({ message: 'Non autorisé' });
        }
        const validation = updateResourceSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({ errors: validation.error.flatten() });
        }
        const oldResource = await ResourceModel.findById(req.params.id).lean();
        if (!oldResource) {
            return res.status(404).json({ message: 'Ressource introuvable' });
        }
        const resource = await ResourceModel.findByIdAndUpdate(
            req.params.id,
            validation.data,
            { new: true, runValidators: true }
        );

        await saveLog(
            `Ressource "${resource.name}" mise à jour`,
            req.user._id,
            {
                actorRole: req.user.role,
                targetId: resource._id,
                targetModel: 'Resource',
                details: {
                    resourceName: resource.name,
                    changes: validation.data,
                    oldAvailableQuantity: oldResource.availableQuantity,
                    newAvailableQuantity: resource.availableQuantity
                }
            }
        );
        res.status(200).json({ resource });
    } catch (error) {
        res.status(500).json({ message: error.message || 'Erreur interne du serveur' });
    }
};

const deleteResource = async (req, res) => {
    try {
        if (req.user.role !== 'RH') {
            return res.status(403).json({ message: 'Non autorisé' });
        }
        const resource = await ResourceModel.findByIdAndDelete(req.params.id);
        if (!resource) {
            return res.status(404).json({ message: 'Ressource introuvable' });
        }

        await saveLog(
            `Ressource "${resource.name}" supprimée de l'inventaire`,
            req.user._id,
            {
                actorRole: req.user.role,
                targetId: resource._id,
                targetModel: 'Resource',
                details: { resourceName: resource.name, category: resource.category }
            }
        );
        res.status(204).json({});
    } catch (error) {
        res.status(500).json({ message: error.message || 'Erreur interne du serveur' });
    }
};

// ═══════════════════════════════════════════════════════════════════
// ─── Resource Request Workflow: Employee → DRH → RH ─────────────
// ═══════════════════════════════════════════════════════════════════

const createResourceRequest = async (req, res) => {
    try {
        if (req.user.role === 'RH') {
            return res.status(403).json({ message: 'Le RH ne peut pas soumettre de demande de ressource' });
        }

        const validation = createResourceRequestSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({ errors: validation.error.flatten() });
        }

        // Determine start state: DRH skips to PENDING_RH, everyone else → PENDING_DRH
        const startState = req.user.role === 'DRH'
            ? RESOURCE_STATES.PENDING_RH
            : RESOURCE_STATES.PENDING_DRH;

        // Find the approver for the start state
        const approverRole = startState === RESOURCE_STATES.PENDING_DRH ? 'DRH' : 'RH';
        const approver = await userModel.findOne({ role: approverRole });

        const request = new ResourceRequestModel({
            userId: req.user._id,
            resourceType: validation.data.resourceType,
            description: validation.data.description || null,
            status: startState,
            currentApproverId: approver?._id || null,
            workflowHistory: [{
                fromState: RESOURCE_STATES.SUBMITTED,
                toState: startState,
                action: 'SUBMIT',
                actorId: req.user._id,
                actorRole: req.user.role,
                timestamp: new Date(),
            }]
        });
        await request.save();

        // Notify the first approver
        if (approver?.email) {
            await sendEmail({
                mail: approver.email,
                subject: 'Nouvelle demande de ressource',
                content: `Nouvelle demande de ressource de ${req.user.firstName} ${req.user.lastName} : ${validation.data.resourceType}.`
            });
        }

        await saveLog(
            `Demande de ressource soumise (${validation.data.resourceType})`,
            req.user._id,
            {
                actorRole: req.user.role,
                targetId: request._id,
                targetModel: 'ResourceRequest',
                oldState: RESOURCE_STATES.SUBMITTED,
                newState: startState,
                details: { resourceType: validation.data.resourceType, approverRole }
            }
        );

        res.status(201).json({ request });
    } catch (error) {
        res.status(500).json({ message: error.message || 'Erreur interne du serveur' });
    }
};

const listMyRequests = async (req, res) => {
    try {
        const requests = await ResourceRequestModel.find({ userId: req.user._id })
            .populate('resourceId', 'name category')
            .populate('currentApproverId', 'firstName lastName role')
            .sort({ createdAt: -1 });
        res.status(200).json({ requests });
    } catch (error) {
        res.status(500).json({ message: error.message || 'Erreur interne du serveur' });
    }
};

// ─── Pending: requests assigned to the current user (DRH or RH) ───

const listPendingResourceApprovals = async (req, res) => {
    try {
        if (!['DRH', 'RH'].includes(req.user.role)) {
            return res.status(403).json({ message: 'Non autorisé' });
        }

        let query;
        if (req.user.role === 'RH') {
            query = {
                $or: [
                    { currentApproverId: req.user._id },
                    { status: RESOURCE_STATES.PENDING_RH }
                ]
            };
        } else {
            // DRH sees only requests assigned to them
            query = { currentApproverId: req.user._id, status: RESOURCE_STATES.PENDING_DRH };
        }

        const requests = await ResourceRequestModel.find(query)
            .populate('userId', 'firstName lastName email role service department matricule')
            .populate('resourceId', 'name category')
            .populate('currentApproverId', 'firstName lastName role')
            .sort({ createdAt: -1 });
        res.status(200).json({ requests });
    } catch (error) {
        res.status(500).json({ message: error.message || 'Erreur interne du serveur' });
    }
};

// ─── DRH forwards to RH ───

const forwardResourceRequest = async (req, res) => {
    try {
        if (req.user.role !== 'DRH') {
            return res.status(403).json({ message: 'Seul le DRH peut transférer la demande' });
        }
        const validation = resourceForwardSchema.safeParse(req.body || {});
        if (!validation.success) {
            return res.status(400).json({ errors: validation.error.flatten() });
        }

        const request = await ResourceRequestModel.findById(req.params.id)
            .populate('userId', 'firstName lastName email');
        if (!request) {
            return res.status(404).json({ message: 'Demande introuvable' });
        }
        if (request.status !== RESOURCE_STATES.PENDING_DRH) {
            return res.status(400).json({ message: 'Cette demande n\'est pas en attente du DRH' });
        }

        const prevState = request.status;
        const rhUser = await userModel.findOne({ role: 'RH' });

        request.status = RESOURCE_STATES.PENDING_RH;
        request.currentApproverId = rhUser?._id || null;
        request.decisionNote = validation.data.decisionNote || null;

        request.workflowHistory.push({
            fromState: prevState,
            toState: RESOURCE_STATES.PENDING_RH,
            action: 'FORWARD',
            actorId: req.user._id,
            actorRole: req.user.role,
            comment: validation.data.decisionNote || null,
            timestamp: new Date(),
        });
        await request.save();

        // Notify RH
        if (rhUser?.email) {
            await sendEmail({
                mail: rhUser.email,
                subject: 'Demande de ressource transférée par le DRH',
                content: `Le DRH a transféré la demande de ressource de ${request.userId?.firstName} ${request.userId?.lastName} (${request.resourceType}) pour validation finale.`
            });
        }

        await saveLog(
            `Demande de ressource transférée au RH (${request.resourceType})`,
            req.user._id,
            {
                actorRole: req.user.role,
                targetId: request._id,
                targetModel: 'ResourceRequest',
                oldState: prevState,
                newState: RESOURCE_STATES.PENDING_RH,
                details: { resourceType: request.resourceType }
            }
        );

        res.status(200).json({ request });
    } catch (error) {
        res.status(500).json({ message: error.message || 'Erreur interne du serveur' });
    }
};

// ─── RH approves (final validation + stock deduction + assignment) ───

const approveResourceRequest = async (req, res) => {
    try {
        if (req.user.role !== 'RH') {
            return res.status(403).json({ message: 'Seul le RH peut approuver la demande' });
        }
        const validation = resourceApprovalSchema.safeParse(req.body || {});
        if (!validation.success) {
            return res.status(400).json({ errors: validation.error.flatten() });
        }

        const request = await ResourceRequestModel.findById(req.params.id)
            .populate('userId', 'firstName lastName email');
        if (!request) {
            return res.status(404).json({ message: 'Demande introuvable' });
        }
        if (request.status !== RESOURCE_STATES.PENDING_RH) {
            return res.status(400).json({ message: 'Cette demande n\'est pas en attente du RH' });
        }

        const { resourceId, decisionNote } = validation.data;

        // Atomic stock deduction
        const resource = await ResourceModel.findOneAndUpdate(
            { _id: resourceId, availableQuantity: { $gte: 1 } },
            { $inc: { availableQuantity: -1 } },
            { new: true }
        );
        if (!resource) {
            return res.status(400).json({ message: 'Ressource non disponible (stock épuisé ou introuvable)' });
        }

        const prevState = request.status;
        request.resourceId = resource._id;
        request.status = RESOURCE_STATES.APPROVED;
        request.currentApproverId = null;
        request.approverId = req.user._id;
        request.decisionNote = decisionNote || null;
        request.decisionAt = new Date();

        request.workflowHistory.push({
            fromState: prevState,
            toState: RESOURCE_STATES.APPROVED,
            action: 'APPROVE',
            actorId: req.user._id,
            actorRole: req.user.role,
            comment: decisionNote || null,
            details: {
                resourceId: resource._id,
                resourceName: resource.name,
                stockBefore: resource.availableQuantity + 1,
                stockAfter: resource.availableQuantity
            },
            timestamp: new Date(),
        });
        await request.save();

        // Record the assignment
        await new ResourceAssignmentModel({
            requestId: request._id,
            resourceId: resource._id,
            assignedTo: request.userId._id || request.userId,
            assignedBy: req.user._id,
            assignedAt: request.decisionAt,
            resourceName: resource.name,
            resourceCategory: resource.category,
            note: decisionNote || null
        }).save();

        // Notify employee
        if (request.userId?.email) {
            await sendEmail({
                mail: request.userId.email,
                subject: 'Demande de ressource approuvée',
                content: `Votre demande de ressource (${request.resourceType}) a été approuvée. Ressource attribuée : ${resource.name} (${resource.category}).`
            });
        }

        await saveLog(
            `Demande de ressource approuvée — stock déduit (${resource.name}: ${resource.availableQuantity + 1} → ${resource.availableQuantity})`,
            req.user._id,
            {
                actorRole: req.user.role,
                targetId: request._id,
                targetModel: 'ResourceRequest',
                oldState: prevState,
                newState: RESOURCE_STATES.APPROVED,
                details: {
                    resourceType: request.resourceType,
                    resourceName: resource.name,
                    resourceCategory: resource.category,
                    stockBefore: resource.availableQuantity + 1,
                    stockAfter: resource.availableQuantity,
                    assignedTo: request.userId?.firstName + ' ' + request.userId?.lastName
                }
            }
        );

        res.status(200).json({ request });
    } catch (error) {
        res.status(500).json({ message: error.message || 'Erreur interne du serveur' });
    }
};

// ─── RH rejects ───

const rejectResourceRequest = async (req, res) => {
    try {
        if (req.user.role !== 'RH') {
            return res.status(403).json({ message: 'Seul le RH peut rejeter la demande' });
        }
        const validation = resourceDecisionSchema.safeParse(req.body || {});
        if (!validation.success) {
            return res.status(400).json({ errors: validation.error.flatten() });
        }

        const request = await ResourceRequestModel.findById(req.params.id)
            .populate('userId', 'firstName lastName email');
        if (!request) {
            return res.status(404).json({ message: 'Demande introuvable' });
        }
        if (request.status !== RESOURCE_STATES.PENDING_RH) {
            return res.status(400).json({ message: 'Cette demande n\'est pas en attente du RH' });
        }

        const prevState = request.status;
        request.status = RESOURCE_STATES.REJECTED;
        request.currentApproverId = null;
        request.approverId = req.user._id;
        request.decisionNote = validation.data.decisionNote || null;
        request.decisionAt = new Date();

        request.workflowHistory.push({
            fromState: prevState,
            toState: RESOURCE_STATES.REJECTED,
            action: 'REJECT',
            actorId: req.user._id,
            actorRole: req.user.role,
            comment: validation.data.decisionNote || null,
            timestamp: new Date(),
        });
        await request.save();

        if (request.userId?.email) {
            const reason = request.decisionNote ? `\nMotif : ${request.decisionNote}` : '';
            await sendEmail({
                mail: request.userId.email,
                subject: 'Demande de ressource rejetée',
                content: `Votre demande de ressource (${request.resourceType}) a été rejetée.${reason}`
            });
        }

        await saveLog(
            `Demande de ressource rejetée (${request.resourceType})`,
            req.user._id,
            {
                actorRole: req.user.role,
                targetId: request._id,
                targetModel: 'ResourceRequest',
                oldState: prevState,
                newState: RESOURCE_STATES.REJECTED,
                details: { resourceType: request.resourceType, reason: validation.data.decisionNote || null }
            }
        );

        res.status(200).json({ request });
    } catch (error) {
        res.status(500).json({ message: error.message || 'Erreur interne du serveur' });
    }
};

// ─── Cancel (employee only, before terminal state) ───

const cancelResourceRequest = async (req, res) => {
    try {
        const request = await ResourceRequestModel.findById(req.params.id);
        if (!request) {
            return res.status(404).json({ message: 'Demande introuvable' });
        }
        if (String(request.userId) !== String(req.user._id)) {
            return res.status(403).json({ message: 'Non autorisé' });
        }
        if (RESOURCE_TERMINAL.includes(request.status)) {
            return res.status(400).json({ message: 'Impossible d\'annuler une demande déjà clôturée' });
        }

        const prevState = request.status;
        request.status = RESOURCE_STATES.CANCELLED;
        request.currentApproverId = null;
        request.decisionAt = new Date();

        request.workflowHistory.push({
            fromState: prevState,
            toState: RESOURCE_STATES.CANCELLED,
            action: 'CANCEL',
            actorId: req.user._id,
            actorRole: req.user.role,
            timestamp: new Date(),
        });
        await request.save();

        await saveLog(
            `Demande de ressource annulée (${request.resourceType})`,
            req.user._id,
            {
                actorRole: req.user.role,
                targetId: request._id,
                targetModel: 'ResourceRequest',
                oldState: prevState,
                newState: RESOURCE_STATES.CANCELLED,
                details: { resourceType: request.resourceType }
            }
        );

        res.status(200).json({ request });
    } catch (error) {
        res.status(500).json({ message: error.message || 'Erreur interne du serveur' });
    }
};

// ═══════════════════════════════════════════════════════════════════
// ─── Assignment history (RH only) ──────────────────────────────────
// ═══════════════════════════════════════════════════════════════════

const listAssignments = async (req, res) => {
    try {
        if (req.user.role !== 'RH') {
            return res.status(403).json({ message: 'Non autorisé' });
        }
        const assignments = await ResourceAssignmentModel.find()
            .populate('assignedTo', 'firstName lastName email role')
            .populate('assignedBy', 'firstName lastName')
            .populate('resourceId', 'name category')
            .sort({ assignedAt: -1 });
        res.status(200).json({ assignments });
    } catch (error) {
        res.status(500).json({ message: error.message || 'Erreur interne du serveur' });
    }
};

module.exports = {
    listResources,
    createResource,
    updateResource,
    deleteResource,
    createResourceRequest,
    listMyRequests,
    listPendingResourceApprovals,
    forwardResourceRequest,
    approveResourceRequest,
    rejectResourceRequest,
    cancelResourceRequest,
    listAssignments
};
