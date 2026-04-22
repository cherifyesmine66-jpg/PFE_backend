const EventEmitter = require('events');
const userModel = require('../models/user.model');

// ─── State & Action Enums ───────────────────────────────────────────

const STATES = {
    SUBMITTED: 'SUBMITTED',
    PENDING_SERVICE_HEAD: 'PENDING_SERVICE_HEAD',
    PENDING_DIRECTION: 'PENDING_DIRECTION',     // Direction (Sub-Director) approves
    PENDING_DIRECTOR: 'PENDING_DIRECTOR',       // DirectionGenerale (Director) approves
    PENDING_DRH: 'PENDING_DRH',
    PENDING_RH: 'PENDING_RH',
    TEMP_MODIFIED: 'TEMP_MODIFIED',
    WAITING_EMPLOYEE_RESPONSE: 'WAITING_EMPLOYEE_RESPONSE',
    APPROVED: 'APPROVED',
    REJECTED: 'REJECTED',
    CANCELLED: 'CANCELLED',
};

const ACTIONS = {
    SUBMIT: 'SUBMIT',
    APPROVE: 'APPROVE',
    REJECT: 'REJECT',
    MODIFY: 'MODIFY',
    ACCEPT_MODIFICATION: 'ACCEPT_MODIFICATION',
    REFUSE_MODIFICATION: 'REFUSE_MODIFICATION',
    CANCEL: 'CANCEL',
};

// ─── Transition Map (replaces all if/else chains) ───────────────────
//
// Hierarchy: Employee → ChefDeService → Direction → DRH → RH
// RH is the final approver AND the application admin.

const TRANSITIONS = {
    [STATES.SUBMITTED]: {
        [ACTIONS.SUBMIT]: null, // dynamic — resolved by _getStartState()
    },
    [STATES.PENDING_SERVICE_HEAD]: {
        [ACTIONS.APPROVE]: STATES.PENDING_DIRECTION,
        [ACTIONS.REJECT]: STATES.REJECTED,
        [ACTIONS.MODIFY]: STATES.WAITING_EMPLOYEE_RESPONSE,
    },
    [STATES.PENDING_DIRECTION]: {
        [ACTIONS.APPROVE]: STATES.PENDING_DIRECTOR,   // Sub-Director → Director level
        [ACTIONS.REJECT]: STATES.REJECTED,
        [ACTIONS.MODIFY]: STATES.WAITING_EMPLOYEE_RESPONSE,
    },
    [STATES.PENDING_DIRECTOR]: {
        [ACTIONS.APPROVE]: STATES.PENDING_DRH,        // Director → DRH level
        [ACTIONS.REJECT]: STATES.REJECTED,
        [ACTIONS.MODIFY]: STATES.WAITING_EMPLOYEE_RESPONSE,
    },
    [STATES.PENDING_DRH]: {
        [ACTIONS.APPROVE]: STATES.PENDING_RH,
        [ACTIONS.REJECT]: STATES.REJECTED,
        [ACTIONS.MODIFY]: STATES.WAITING_EMPLOYEE_RESPONSE,
    },
    [STATES.PENDING_RH]: {
        [ACTIONS.APPROVE]: STATES.APPROVED,
        [ACTIONS.REJECT]: STATES.REJECTED,
        [ACTIONS.MODIFY]: STATES.WAITING_EMPLOYEE_RESPONSE,
    },
    [STATES.WAITING_EMPLOYEE_RESPONSE]: {
        [ACTIONS.ACCEPT_MODIFICATION]: null, // dynamic — resume at stored state
        [ACTIONS.REFUSE_MODIFICATION]: STATES.CANCELLED,
    },
};

// ─── Role / State Mappings ──────────────────────────────────────────

const STATE_REQUIRED_ROLE = {
    [STATES.PENDING_SERVICE_HEAD]: 'ChefDeService',
    [STATES.PENDING_DIRECTION]: 'Direction',           // Sub-Director
    [STATES.PENDING_DIRECTOR]: 'DirectionGenerale',   // Director
    [STATES.PENDING_DRH]: 'DRH',
    [STATES.PENDING_RH]: 'RH',
};

// When an employee of a given role submits, the first approval state is:
// Each role skips the levels below them and starts at their direct manager's level.
const ROLE_START_STATE = {
    Employee: STATES.PENDING_SERVICE_HEAD,
    ChefDeService: STATES.PENDING_DIRECTION,
    Direction: STATES.PENDING_DIRECTOR,
    DirectionGenerale: STATES.PENDING_DRH,
    DRH: STATES.PENDING_RH,
};

const TERMINAL_STATES = [STATES.APPROVED, STATES.REJECTED, STATES.CANCELLED];

// ─── WorkflowService ────────────────────────────────────────────────

class WorkflowService extends EventEmitter {

    // ── helpers ─────────────────────────────────────────

    canTransition(currentState, action) {
        const map = TRANSITIONS[currentState];
        return !!(map && action in map);
    }

    _getStartState(employeeRole) {
        return ROLE_START_STATE[employeeRole] || STATES.PENDING_SERVICE_HEAD;
    }

    // Walk up the manager chain to find a user with the given role
    async _findByManagerChain(startUserId, targetRole) {
        let currentId = startUserId;
        const visited = new Set();

        while (currentId) {
            if (visited.has(String(currentId))) break;
            visited.add(String(currentId));

            const current = await userModel.findById(currentId);
            if (!current) break;

            // Check the current node itself (handles direct manager match)
            if (current.role === targetRole && String(current._id) !== String(startUserId)) {
                return current;
            }

            if (current.managerId) {
                currentId = current.managerId;
            } else {
                break;
            }
        }
        return null;
    }

    async findApproverForState(leave, targetState) {
        const requiredRole = STATE_REQUIRED_ROLE[targetState];

        // DRH / RH — global roles, find by role
        if (requiredRole === 'DRH' || requiredRole === 'RH') {
            return userModel.findOne({ role: requiredRole });
        }

        // ChefDeService / Direction — walk the manager chain from the employee
        if (requiredRole) {
            return this._findByManagerChain(leave.userId, requiredRole);
        }

        return null;
    }

    // ── Submit ──────────────────────────────────────────

    async submit(leave, employee) {
        if (leave.status !== STATES.SUBMITTED) {
            throw new Error("La demande doit être à l'état SUBMITTED");
        }

        const startState = this._getStartState(employee.role);
        const approver = await this.findApproverForState(leave, startState);

        const prev = leave.status;
        leave.status = startState;
        leave.currentApproverId = approver?._id || null;

        leave.workflowHistory.push({
            fromState: prev,
            toState: startState,
            action: ACTIONS.SUBMIT,
            actorId: employee._id,
            timestamp: new Date(),
        });

        await leave.save();

        this.emit('transition', {
            leave, fromState: prev, toState: startState,
            action: ACTIONS.SUBMIT, actor: employee,
        });
        this.emit('submitted', { leave, approver });

        return leave;
    }

    // ── Approve ─────────────────────────────────────────

    async approve(leave, actor, comment) {
        this._validateActor(leave, actor);

        if (!this.canTransition(leave.status, ACTIONS.APPROVE)) {
            throw new Error(`Action APPROVE non permise à l'état ${leave.status}`);
        }

        const prev = leave.status;
        const nextState = TRANSITIONS[prev][ACTIONS.APPROVE];

        let nextApprover = null;
        if (nextState !== STATES.APPROVED) {
            nextApprover = await this.findApproverForState(leave, nextState);
        }

        leave.status = nextState;
        leave.currentApproverId = nextApprover?._id || null;
        leave.decisionNote = comment || null;

        if (nextState === STATES.APPROVED) {
            leave.decisionAt = new Date();
            leave.approverId = actor._id;
        }

        leave.workflowHistory.push({
            fromState: prev, toState: nextState,
            action: ACTIONS.APPROVE, actorId: actor._id,
            comment, timestamp: new Date(),
        });

        await leave.save();

        this.emit('transition', {
            leave, fromState: prev, toState: nextState,
            action: ACTIONS.APPROVE, actor,
        });

        if (nextState === STATES.APPROVED) {
            this.emit('approved', { leave, actor });
        } else {
            this.emit('escalated', { leave, actor, nextApprover, nextState });
        }

        return leave;
    }

    // ── Reject ──────────────────────────────────────────

    async reject(leave, actor, comment) {
        this._validateActor(leave, actor);

        if (!this.canTransition(leave.status, ACTIONS.REJECT)) {
            throw new Error(`Action REJECT non permise à l'état ${leave.status}`);
        }

        const prev = leave.status;
        leave.status = STATES.REJECTED;
        leave.currentApproverId = null;
        leave.approverId = actor._id;
        leave.decisionNote = comment || null;
        leave.decisionAt = new Date();

        leave.workflowHistory.push({
            fromState: prev, toState: STATES.REJECTED,
            action: ACTIONS.REJECT, actorId: actor._id,
            comment, timestamp: new Date(),
        });

        await leave.save();

        this.emit('transition', {
            leave, fromState: prev, toState: STATES.REJECTED,
            action: ACTIONS.REJECT, actor,
        });
        this.emit('rejected', { leave, actor });

        return leave;
    }

    // ── Modify (propose different dates / days) ─────────

    async modify(leave, actor, { days, startDate, endDate, comment }) {
        this._validateActor(leave, actor);

        if (!this.canTransition(leave.status, ACTIONS.MODIFY)) {
            throw new Error(`Action MODIFY non permise à l'état ${leave.status}`);
        }

        const prev = leave.status;

        // Preserve originals on first modification
        if (leave.originalDays == null) {
            leave.originalDays = leave.days;
            leave.originalStartDate = leave.startDate;
            leave.originalEndDate = leave.endDate;
        }

        leave.resumeAtState = prev; // will return here after employee response
        leave.modifiedDays = days;
        leave.modifiedStartDate = startDate;
        leave.modifiedEndDate = endDate;

        leave.status = STATES.WAITING_EMPLOYEE_RESPONSE;
        leave.currentApproverId = null; // employee must respond

        leave.workflowHistory.push({
            fromState: prev,
            toState: STATES.WAITING_EMPLOYEE_RESPONSE,
            action: ACTIONS.MODIFY,
            actorId: actor._id,
            comment,
            modifiedFields: { days, startDate, endDate },
            timestamp: new Date(),
        });

        await leave.save();

        this.emit('transition', {
            leave, fromState: prev,
            toState: STATES.WAITING_EMPLOYEE_RESPONSE,
            action: ACTIONS.MODIFY, actor,
        });
        this.emit('modified', { leave, actor });

        return leave;
    }

    // ── Employee accepts modification ───────────────────

    async acceptModification(leave, actor, comment) {
        if (leave.status !== STATES.WAITING_EMPLOYEE_RESPONSE) {
            throw new Error("La demande n'est pas en attente de réponse employé");
        }
        if (String(leave.userId) !== String(actor._id)) {
            throw new Error("Seul l'employé concerné peut répondre");
        }

        // Apply proposed values
        leave.days = leave.modifiedDays;
        leave.startDate = leave.modifiedStartDate;
        leave.endDate = leave.modifiedEndDate;

        const resumeState = leave.resumeAtState;
        const prev = leave.status;

        const approver = await this.findApproverForState(leave, resumeState);

        leave.status = resumeState;
        leave.currentApproverId = approver?._id || null;
        leave.resumeAtState = null;
        leave.modifiedDays = null;
        leave.modifiedStartDate = null;
        leave.modifiedEndDate = null;

        leave.workflowHistory.push({
            fromState: prev, toState: resumeState,
            action: ACTIONS.ACCEPT_MODIFICATION,
            actorId: actor._id, comment,
            timestamp: new Date(),
        });

        await leave.save();

        this.emit('transition', {
            leave, fromState: prev, toState: resumeState,
            action: ACTIONS.ACCEPT_MODIFICATION, actor,
        });
        this.emit('modificationAccepted', { leave, actor, approver });

        return leave;
    }

    // ── Employee refuses modification ───────────────────

    async refuseModification(leave, actor, comment) {
        if (leave.status !== STATES.WAITING_EMPLOYEE_RESPONSE) {
            throw new Error("La demande n'est pas en attente de réponse employé");
        }
        if (String(leave.userId) !== String(actor._id)) {
            throw new Error("Seul l'employé concerné peut répondre");
        }

        const prev = leave.status;
        leave.status = STATES.CANCELLED;
        leave.currentApproverId = null;
        leave.decisionAt = new Date();

        leave.workflowHistory.push({
            fromState: prev, toState: STATES.CANCELLED,
            action: ACTIONS.REFUSE_MODIFICATION,
            actorId: actor._id, comment,
            timestamp: new Date(),
        });

        await leave.save();

        this.emit('transition', {
            leave, fromState: prev, toState: STATES.CANCELLED,
            action: ACTIONS.REFUSE_MODIFICATION, actor,
        });
        this.emit('cancelled', { leave, actor });

        return leave;
    }

    // ── Cancel (by employee, before terminal state) ─────

    async cancel(leave, actor, comment) {
        if (String(leave.userId) !== String(actor._id)) {
            throw new Error("Seul l'employé concerné peut annuler");
        }
        if (TERMINAL_STATES.includes(leave.status)) {
            throw new Error("Impossible d'annuler une demande déjà clôturée");
        }

        const prev = leave.status;
        leave.status = STATES.CANCELLED;
        leave.currentApproverId = null;
        leave.decisionAt = new Date();

        leave.workflowHistory.push({
            fromState: prev, toState: STATES.CANCELLED,
            action: ACTIONS.CANCEL, actorId: actor._id,
            comment, timestamp: new Date(),
        });

        await leave.save();

        this.emit('transition', {
            leave, fromState: prev, toState: STATES.CANCELLED,
            action: ACTIONS.CANCEL, actor,
        });
        this.emit('cancelled', { leave, actor });

        return leave;
    }

    // ── Actor validation ────────────────────────────────

    _validateActor(leave, actor) {
        const requiredRole = STATE_REQUIRED_ROLE[leave.status];

        // RH is the application admin — can always act
        if (actor.role === 'RH') return;

        if (requiredRole && actor.role !== requiredRole) {
            throw new Error(
                `Le rôle ${actor.role} n'est pas autorisé à agir sur l'état ${leave.status}`
            );
        }

        if (
            leave.currentApproverId &&
            String(leave.currentApproverId) !== String(actor._id)
        ) {
            throw new Error(
                "Vous n'êtes pas l'approbateur désigné pour cette demande"
            );
        }
    }
}

// Singleton
const workflowService = new WorkflowService();

module.exports = {
    workflowService,
    WorkflowService,
    STATES,
    ACTIONS,
    TRANSITIONS,
    STATE_REQUIRED_ROLE,
    ROLE_START_STATE,
    TERMINAL_STATES,
};
