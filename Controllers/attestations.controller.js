const AttestationModel = require('../models/attestation.model');
const { ATTESTATION_STATES } = require('../models/attestation.model');
const userModel = require('../models/user.model');
const { saveLog } = require('../utils/logger');
const { generateAttestationPDF } = require('../utils/pdf-generator');
const {
    createAttestationRequestSchema,
    attestationForwardSchema,
    attestationRejectSchema,
    attestationGenerateSchema,
} = require('../schemas/attestation.schema');

// ─── Employee: create a new attestation request ─────────────────────

const createAttestationRequest = async (req, res) => {
    try {
        if (req.user.role === 'RH') {
            return res.status(403).json({ message: 'Le RH ne peut pas soumettre une demande d\'attestation' });
        }

        const validation = createAttestationRequestSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({ errors: validation.error.flatten() });
        }

        // DRH skips directly to PENDING_RH, everyone else → PENDING_DRH
        const startState = req.user.role === 'DRH'
            ? ATTESTATION_STATES.PENDING_RH
            : ATTESTATION_STATES.PENDING_DRH;

        const approverRole = startState === ATTESTATION_STATES.PENDING_DRH ? 'DRH' : 'RH';
        const approver = await userModel.findOne({ role: approverRole });

        const request = new AttestationModel({
            userId: req.user._id,
            attestationType: validation.data.attestationType,
            purpose: validation.data.purpose || null,
            status: startState,
            currentApproverId: approver?._id || null,
            workflowHistory: [{
                fromState: ATTESTATION_STATES.SUBMITTED,
                toState: startState,
                action: 'SUBMIT',
                actorId: req.user._id,
                actorRole: req.user.role,
                timestamp: new Date(),
            }],
        });
        await request.save();

        await saveLog(
            `Demande d'attestation soumise (${validation.data.attestationType})`,
            req.user._id,
            {
                actorRole: req.user.role,
                targetId: request._id,
                targetModel: 'Attestation',
                oldState: ATTESTATION_STATES.SUBMITTED,
                newState: startState,
                details: { attestationType: validation.data.attestationType, approverRole },
            }
        );

        res.status(201).json({ request });
    } catch (error) {
        res.status(500).json({ message: error.message || 'Erreur interne du serveur' });
    }
};

// ─── Employee: list own attestation requests ────────────────────────

const listMyAttestations = async (req, res) => {
    try {
        const requests = await AttestationModel.find({ userId: req.user._id })
            .populate('currentApproverId', 'firstName lastName role')
            .sort({ createdAt: -1 });
        res.status(200).json({ requests });
    } catch (error) {
        res.status(500).json({ message: error.message || 'Erreur interne du serveur' });
    }
};

// ─── DRH / RH: list pending attestations ────────────────────────────

const listPendingAttestations = async (req, res) => {
    try {
        if (!['DRH', 'RH'].includes(req.user.role)) {
            return res.status(403).json({ message: 'Non autorisé' });
        }

        let query;
        if (req.user.role === 'RH') {
            query = {
                $or: [
                    { currentApproverId: req.user._id },
                    { status: ATTESTATION_STATES.PENDING_RH },
                ],
            };
        } else {
            query = { currentApproverId: req.user._id, status: ATTESTATION_STATES.PENDING_DRH };
        }

        const requests = await AttestationModel.find(query)
            .populate('userId', 'firstName lastName email role service department matricule')
            .populate('currentApproverId', 'firstName lastName role')
            .sort({ createdAt: -1 });
        res.status(200).json({ requests });
    } catch (error) {
        res.status(500).json({ message: error.message || 'Erreur interne du serveur' });
    }
};

// ─── DRH: forward to RH ─────────────────────────────────────────────

const forwardAttestationRequest = async (req, res) => {
    try {
        if (req.user.role !== 'DRH') {
            return res.status(403).json({ message: 'Seul le DRH peut transférer la demande' });
        }

        const validation = attestationForwardSchema.safeParse(req.body || {});
        if (!validation.success) {
            return res.status(400).json({ errors: validation.error.flatten() });
        }

        const request = await AttestationModel.findById(req.params.id);
        if (!request) return res.status(404).json({ message: 'Demande introuvable' });
        if (request.status !== ATTESTATION_STATES.PENDING_DRH) {
            return res.status(409).json({ message: 'La demande n\'est pas en attente DRH' });
        }

        const rh = await userModel.findOne({ role: 'RH' });
        const oldState = request.status;

        request.status = ATTESTATION_STATES.PENDING_RH;
        request.currentApproverId = rh?._id || null;
        if (validation.data.decisionNote) request.decisionNote = validation.data.decisionNote;
        request.workflowHistory.push({
            fromState: oldState,
            toState: ATTESTATION_STATES.PENDING_RH,
            action: 'FORWARD',
            actorId: req.user._id,
            actorRole: req.user.role,
            comment: validation.data.decisionNote || null,
            timestamp: new Date(),
        });
        await request.save();

        await saveLog(
            'Demande d\'attestation transférée au RH',
            req.user._id,
            {
                actorRole: req.user.role,
                targetId: request._id,
                targetModel: 'Attestation',
                oldState,
                newState: ATTESTATION_STATES.PENDING_RH,
            }
        );

        res.status(200).json({ request });
    } catch (error) {
        res.status(500).json({ message: error.message || 'Erreur interne du serveur' });
    }
};

// ─── DRH or RH: reject ──────────────────────────────────────────────

const rejectAttestationRequest = async (req, res) => {
    try {
        if (!['DRH', 'RH'].includes(req.user.role)) {
            return res.status(403).json({ message: 'Non autorisé' });
        }

        const validation = attestationRejectSchema.safeParse(req.body || {});
        if (!validation.success) {
            return res.status(400).json({ errors: validation.error.flatten() });
        }

        const request = await AttestationModel.findById(req.params.id);
        if (!request) return res.status(404).json({ message: 'Demande introuvable' });

        const allowedStates = req.user.role === 'DRH'
            ? [ATTESTATION_STATES.PENDING_DRH]
            : [ATTESTATION_STATES.PENDING_RH];

        if (!allowedStates.includes(request.status)) {
            return res.status(409).json({ message: 'Action non autorisée dans l\'état actuel' });
        }

        const oldState = request.status;
        request.status = ATTESTATION_STATES.REJECTED;
        request.currentApproverId = null;
        if (validation.data.decisionNote) request.decisionNote = validation.data.decisionNote;
        request.workflowHistory.push({
            fromState: oldState,
            toState: ATTESTATION_STATES.REJECTED,
            action: 'REJECT',
            actorId: req.user._id,
            actorRole: req.user.role,
            comment: validation.data.decisionNote || null,
            timestamp: new Date(),
        });
        await request.save();

        await saveLog(
            'Demande d\'attestation rejetée',
            req.user._id,
            {
                actorRole: req.user.role,
                targetId: request._id,
                targetModel: 'Attestation',
                oldState,
                newState: ATTESTATION_STATES.REJECTED,
            }
        );

        res.status(200).json({ request });
    } catch (error) {
        res.status(500).json({ message: error.message || 'Erreur interne du serveur' });
    }
};

// ─── RH: generate PDF and approve ───────────────────────────────────

const generateAttestation = async (req, res) => {
    try {
        if (req.user.role !== 'RH') {
            return res.status(403).json({ message: 'Seul le RH peut générer l\'attestation' });
        }

        const validation = attestationGenerateSchema.safeParse(req.body || {});
        if (!validation.success) {
            return res.status(400).json({ errors: validation.error.flatten() });
        }

        const request = await AttestationModel.findById(req.params.id).populate('userId');
        if (!request) return res.status(404).json({ message: 'Demande introuvable' });
        if (request.status !== ATTESTATION_STATES.PENDING_RH) {
            return res.status(409).json({ message: 'La demande n\'est pas en attente RH' });
        }

        const employee = request.userId;

        const filename = await generateAttestationPDF({
            type: request.attestationType,
            employee: {
                firstName:  employee.firstName,
                lastName:   employee.lastName,
                matricule:  employee.matricule,
                service:    employee.service,
                department: employee.department,
                dob:        employee.dob,
            },
            salary: employee.salary || null,
            generatedBy: `${req.user.firstName} ${req.user.lastName}`,
            date: new Date(),
        });

        const oldState = request.status;
        request.status = ATTESTATION_STATES.APPROVED;
        request.currentApproverId = null;
        request.pdfFilename = filename;
        if (validation.data.decisionNote) request.decisionNote = validation.data.decisionNote;
        request.workflowHistory.push({
            fromState: oldState,
            toState: ATTESTATION_STATES.APPROVED,
            action: 'GENERATE',
            actorId: req.user._id,
            actorRole: req.user.role,
            comment: validation.data.decisionNote || null,
            timestamp: new Date(),
        });
        await request.save();

        await saveLog(
            `Attestation ${request.attestationType} générée`,
            req.user._id,
            {
                actorRole: req.user.role,
                targetId: request._id,
                targetModel: 'Attestation',
                oldState,
                newState: ATTESTATION_STATES.APPROVED,
                details: { pdfFilename: filename },
            }
        );

        res.status(200).json({ request, pdfFilename: filename });
    } catch (error) {
        res.status(500).json({ message: error.message || 'Erreur interne du serveur' });
    }
};

// ─── Employee: cancel a pending request ─────────────────────────────

const cancelAttestationRequest = async (req, res) => {
    try {
        const request = await AttestationModel.findById(req.params.id);
        if (!request) return res.status(404).json({ message: 'Demande introuvable' });

        // Only the requester can cancel, and only while pending
        if (request.userId.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'Non autorisé' });
        }

        const cancellableStates = [ATTESTATION_STATES.PENDING_DRH, ATTESTATION_STATES.PENDING_RH];
        if (!cancellableStates.includes(request.status)) {
            return res.status(409).json({ message: 'La demande ne peut plus être annulée dans son état actuel' });
        }

        const oldState = request.status;
        request.status = ATTESTATION_STATES.CANCELLED;
        request.currentApproverId = null;
        request.workflowHistory.push({
            fromState: oldState,
            toState: ATTESTATION_STATES.CANCELLED,
            action: 'CANCEL',
            actorId: req.user._id,
            actorRole: req.user.role,
            timestamp: new Date(),
        });
        await request.save();

        await saveLog(
            'Demande d\'attestation annulée par l\'employé',
            req.user._id,
            {
                actorRole: req.user.role,
                targetId: request._id,
                targetModel: 'Attestation',
                oldState,
                newState: ATTESTATION_STATES.CANCELLED,
            }
        );

        res.status(200).json({ request });
    } catch (error) {
        res.status(500).json({ message: error.message || 'Erreur interne du serveur' });
    }
};

module.exports = {
    createAttestationRequest,
    listMyAttestations,
    listPendingAttestations,
    forwardAttestationRequest,
    rejectAttestationRequest,
    generateAttestation,
    cancelAttestationRequest,
};
