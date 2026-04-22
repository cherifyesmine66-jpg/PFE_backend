const userModel = require('../models/user.model');
const sendEmail = require('../utils/mailer');

/**
 * NotificationService — listens to WorkflowService events
 * and sends email notifications to the right people.
 */
class NotificationService {
    constructor(workflowService) {
        this.workflowService = workflowService;
        this._bind();
    }

    _bind() {
        this.workflowService.on('submitted', (d) => this._onSubmitted(d));
        this.workflowService.on('escalated', (d) => this._onEscalated(d));
        this.workflowService.on('approved', (d) => this._onApproved(d));
        this.workflowService.on('rejected', (d) => this._onRejected(d));
        this.workflowService.on('modified', (d) => this._onModified(d));
        this.workflowService.on('modificationAccepted', (d) => this._onModAccepted(d));
        this.workflowService.on('cancelled', (d) => this._onCancelled(d));
    }

    // ── helpers ─────────────────────────────────────────

    async _getEmployee(leave) {
        return userModel.findById(leave.userId);
    }

    async _send(to, subject, content) {
        try {
            const recipients = Array.isArray(to) ? to.filter(Boolean) : [to].filter(Boolean);
            if (recipients.length === 0) return;
            await sendEmail({ mail: recipients, subject, content });
        } catch (err) {
            console.error('[NotificationService] email failed:', err.message);
        }
    }

    // ── event handlers ──────────────────────────────────

    async _onSubmitted({ leave, approver }) {
        if (!approver?.email) return;
        const emp = await this._getEmployee(leave);
        await this._send(
            approver.email,
            'Nouvelle demande de congé à traiter',
            `Une demande de congé de ${emp?.firstName} ${emp?.lastName} nécessite votre validation.`
        );
    }

    async _onEscalated({ leave, nextApprover, nextState }) {
        if (!nextApprover?.email) return;
        const emp = await this._getEmployee(leave);
        await this._send(
            nextApprover.email,
            'Demande de congé escaladée',
            `La demande de congé de ${emp?.firstName} ${emp?.lastName} a été approuvée au niveau précédent et nécessite maintenant votre validation (${nextState}).`
        );
    }

    async _onApproved({ leave }) {
        const emp = await this._getEmployee(leave);
        if (!emp?.email) return;
        await this._send(
            emp.email,
            'Demande de congé approuvée',
            `Votre demande de congé du ${leave.startDate?.toISOString().slice(0, 10)} au ${leave.endDate?.toISOString().slice(0, 10)} a été approuvée définitivement.`
        );
    }

    async _onRejected({ leave, actor }) {
        const emp = await this._getEmployee(leave);
        if (!emp?.email) return;
        const note = leave.decisionNote ? `\nMotif : ${leave.decisionNote}` : '';
        await this._send(
            emp.email,
            'Demande de congé rejetée',
            `Votre demande de congé a été rejetée par ${actor.firstName} ${actor.lastName}.${note}`
        );
    }

    async _onModified({ leave, actor }) {
        const emp = await this._getEmployee(leave);
        if (!emp?.email) return;
        await this._send(
            emp.email,
            'Modification proposée sur votre demande de congé',
            `${actor.firstName} ${actor.lastName} a proposé une modification de votre demande de congé : ${leave.modifiedDays} jour(s) du ${leave.modifiedStartDate?.toISOString().slice(0, 10)} au ${leave.modifiedEndDate?.toISOString().slice(0, 10)}. Veuillez accepter ou refuser.`
        );
    }

    async _onModAccepted({ leave, approver }) {
        if (!approver?.email) return;
        const emp = await this._getEmployee(leave);
        await this._send(
            approver.email,
            'Modification acceptée — demande de congé à revalider',
            `${emp?.firstName} ${emp?.lastName} a accepté la modification. La demande reprend à votre niveau (${leave.status}).`
        );
    }

    async _onCancelled({ leave }) {
        const emp = await this._getEmployee(leave);
        // Notify RH about the cancellation
        const rhUsers = await userModel.find({ role: 'RH' }).lean();
        const rhEmails = rhUsers.map((u) => u.email).filter(Boolean);
        if (rhEmails.length > 0) {
            await this._send(
                rhEmails,
                'Demande de congé annulée',
                `La demande de congé de ${emp?.firstName} ${emp?.lastName} a été annulée.`
            );
        }
    }
}

module.exports = NotificationService;
