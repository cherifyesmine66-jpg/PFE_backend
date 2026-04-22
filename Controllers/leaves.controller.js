const LeaveTypeModel = require('../models/leave-type.model');
const LeaveBalanceModel = require('../models/leave-balance.model');
const LeaveRequestModel = require('../models/leave-request.model');
const HolidayModel = require('../models/holiday.model');
const userModel = require('../models/user.model');
const { saveLog } = require('../utils/logger');
const { workflowService } = require('../services');
const { STATES, TERMINAL_STATES } = require('../services/workflow.service');
const {
    createLeaveSchema,
    decisionSchema,
    modifyLeaveSchema,
    attachmentSchema,
    createLeaveTypeSchema,
    updateLeaveTypeSchema,
} = require('../schemas/leave.schema');
const { runMonthlyAccrual } = require('../utils/accrual');
const {
    toDateOnly,
    toDateKey,
    getStartOfMonth,
    getMonthIndex,
    calculateBusinessDays,
} = require('../utils/leave');

// â”€â”€â”€ Seed data â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const defaultLeaveTypes = [
    { name: 'Annual', code: 'ANNUAL', paid: true, monthlyAccrual: 1.75 },
    { name: 'Sick', code: 'SICK', paid: true, monthlyAccrual: 1, requiresCertificateAfterDays: 2 },
    { name: 'Unpaid', code: 'UNPAID', paid: false, monthlyAccrual: 0 },
    { name: 'Maternity', code: 'MATERNITY', paid: false, monthlyAccrual: 0 },
    { name: 'Paternity', code: 'PATERNITY', paid: false, monthlyAccrual: 0 },
    { name: 'Bereavement', code: 'BEREAVEMENT', paid: false, monthlyAccrual: 0 },
    { name: 'Study', code: 'STUDY', paid: false, monthlyAccrual: 0 },
    { name: 'Compensatory', code: 'COMP', paid: true, monthlyAccrual: 0 },
    { name: 'Special', code: 'SPECIAL', paid: false, monthlyAccrual: 0 },
];

// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const getCountryCode = (user, fallback) => {
    const raw = user?.countryCode || fallback || 'DEFAULT';
    return raw.toUpperCase();
};

const ensureAccrual = async (userId, leaveType, asOfDate) => {
    let balance = await LeaveBalanceModel.findOne({ userId, typeId: leaveType._id });
    const nowMonth = getStartOfMonth(asOfDate);
    const previousMonth = getStartOfMonth(new Date(Date.UTC(asOfDate.getUTCFullYear(), asOfDate.getUTCMonth() - 1, 1)));

    if (!balance) {
        balance = new LeaveBalanceModel({
            userId,
            typeId: leaveType._id,
            accrued: 0, used: 0, available: 0,
            lastAccruedAt: previousMonth,
        });
    }

    const lastAccruedAt = balance.lastAccruedAt ? getStartOfMonth(balance.lastAccruedAt) : previousMonth;
    const monthsToAccrue = getMonthIndex(nowMonth) - getMonthIndex(lastAccruedAt);
    if (monthsToAccrue > 0) {
        if (leaveType.monthlyAccrual > 0) {
            const increment = monthsToAccrue * leaveType.monthlyAccrual;
            balance.accrued += increment;
            balance.available += increment;
        }
        balance.lastAccruedAt = nowMonth;
        await balance.save();
        return balance;
    }

    if (balance.isNew) await balance.save();
    return balance;
};

const getHolidayKeys = async (countryCode, startDate, endDate) => {
    const holidays = await HolidayModel.find({
        countryCode,
        date: { $gte: startDate, $lte: endDate },
    }).lean();
    return new Set(holidays.map((h) => toDateKey(h.date)));
};

const seedLeaveTypes = async () => {
    const existing = await LeaveTypeModel.find().lean();
    if (existing.length > 0) return;
    await LeaveTypeModel.insertMany(defaultLeaveTypes);
};

// â”€â”€â”€ Leave Type CRUD (RH only for write) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const getLeaveTypes = async (req, res) => {
    try {
        await seedLeaveTypes();
        const query = req.user?.role === 'RH' ? {} : { isActive: true };
        const types = await LeaveTypeModel.find(query).sort({ name: 1 });
        res.status(200).json({ types });
    } catch (error) {
        res.status(500).json({ message: error.message || 'Erreur interne du serveur' });
    }
};

const createLeaveType = async (req, res) => {
    try {
        if (req.user.role !== 'RH') {
            return res.status(403).json({ message: 'Non autorisÃ©' });
        }
        const validation = createLeaveTypeSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({ errors: validation.error.flatten() });
        }
        const payload = validation.data;
        const leaveType = new LeaveTypeModel({ ...payload, code: payload.code.toUpperCase() });
        await leaveType.save();
        res.status(201).json({ type: leaveType });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({ message: 'Ce type de congÃ© existe dÃ©jÃ ' });
        }
        res.status(500).json({ message: error.message || 'Erreur interne du serveur' });
    }
};

const getLeaveTypeById = async (req, res) => {
    try {
        const type = await LeaveTypeModel.findById(req.params.id);
        if (!type) return res.status(404).json({ message: 'Type de congÃ© introuvable' });
        res.status(200).json({ type });
    } catch (error) {
        res.status(500).json({ message: error.message || 'Erreur interne du serveur' });
    }
};

const updateLeaveType = async (req, res) => {
    try {
        if (req.user.role !== 'RH') {
            return res.status(403).json({ message: 'Non autorisÃ©' });
        }
        const validation = updateLeaveTypeSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({ errors: validation.error.flatten() });
        }
        const type = await LeaveTypeModel.findByIdAndUpdate(req.params.id, validation.data, { new: true, runValidators: true });
        if (!type) return res.status(404).json({ message: 'Type de congÃ© introuvable' });
        res.status(200).json({ type });
    } catch (error) {
        res.status(500).json({ message: error.message || 'Erreur interne du serveur' });
    }
};

const deactivateLeaveType = async (req, res) => {
    try {
        if (req.user.role !== 'RH') {
            return res.status(403).json({ message: 'Non autorisÃ©' });
        }
        const type = await LeaveTypeModel.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
        if (!type) return res.status(404).json({ message: 'Type de congÃ© introuvable' });
        res.status(200).json({ type });
    } catch (error) {
        res.status(500).json({ message: error.message || 'Erreur interne du serveur' });
    }
};

// Leave Request â€” Submit (creates + triggers workflow) 

const requestLeave = async (req, res) => {
    try {
        // RH cannot submit leave for themselves (they are the admin)
        if (req.user.role === 'RH') {
            return res.status(403).json({ message: 'Le RH ne peut pas soumettre de demande de congÃ©' });
        }

        const validation = createLeaveSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({ errors: validation.error.flatten() });
        }

        const { typeId, startDate, endDate, reason, attachment } = validation.data;
        const leaveType = await LeaveTypeModel.findById(typeId);
        if (!leaveType || !leaveType.isActive) {
            return res.status(404).json({ message: 'Type de congÃ© introuvable' });
        }

        const start = toDateOnly(startDate);
        const end = toDateOnly(endDate);
        if (!start || !end) return res.status(400).json({ message: 'Dates invalides' });
        if (end < start) return res.status(400).json({ message: 'La date de fin doit Ãªtre aprÃ¨s la date de dÃ©but' });

        const countryCode = getCountryCode(req.user);
        const holidayKeys = await getHolidayKeys(countryCode, start, end);
        const businessDays = calculateBusinessDays(start, end, holidayKeys);
        if (businessDays <= 0) {
            return res.status(400).json({ message: 'Aucun jour ouvrable dans la pÃ©riode sÃ©lectionnÃ©e' });
        }

        if (leaveType.paid) {
            const balance = await ensureAccrual(req.user._id, leaveType, new Date());
            if (balance.available < businessDays) {
                return res.status(400).json({ message: 'Solde de congÃ©s insuffisant' });
            }
        }

        const certificateRequired =
            Number.isFinite(leaveType.requiresCertificateAfterDays) &&
            businessDays > leaveType.requiresCertificateAfterDays;

        // Create the leave request in SUBMITTED state
        const leaveRequest = new LeaveRequestModel({
            userId: req.user._id,
            typeId: leaveType._id,
            managerId: req.user.managerId || null,
            startDate: start,
            endDate: end,
            days: businessDays,
            status: STATES.SUBMITTED,
            reason: reason || null,
            attachment: attachment || null,
            certificateRequired,
            certificateUploadedAt: attachment ? new Date() : null,
        });
        await leaveRequest.save();

        // Trigger the workflow â€” moves to the first PENDING state
        // Notifications & audit logged automatically via services
        await workflowService.submit(leaveRequest, req.user);

        res.status(201).json({ leave: leaveRequest });
    } catch (error) {
        res.status(500).json({ message: error.message || 'Erreur interne du serveur' });
    }
};

// â”€â”€â”€ My leaves â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const listMyLeaves = async (req, res) => {
    try {
        const leaves = await LeaveRequestModel.find({ userId: req.user._id })
            .populate('typeId', 'name code paid requiresCertificateAfterDays')
            .populate('currentApproverId', 'firstName lastName role')
            .sort({ createdAt: -1 });
        res.status(200).json({ leaves });
    } catch (error) {
        res.status(500).json({ message: error.message || 'Erreur interne du serveur' });
    }
};

// â”€â”€â”€ Balances â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const getLeaveBalances = async (req, res) => {
    try {
        await seedLeaveTypes();
        const types = await LeaveTypeModel.find({ isActive: true }).sort({ name: 1 });
        const balances = await Promise.all(
            types.map(async (type) => {
                const balance = await ensureAccrual(req.user._id, type, new Date());
                return {
                    typeId: type._id,
                    typeName: type.name,
                    code: type.code,
                    paid: type.paid,
                    monthlyAccrual: type.monthlyAccrual,
                    accrued: balance.accrued,
                    used: balance.used,
                    available: balance.available,
                };
            })
        );
        res.status(200).json({ balances });
    } catch (error) {
        res.status(500).json({ message: error.message || 'Erreur interne du serveur' });
    }
};

// â”€â”€â”€ Pending approvals (for current user) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const listPendingApprovals = async (req, res) => {
    try {
        // Only approver roles can see pending approvals
        const approverRoles = ['ChefDeService', 'Direction', 'DirectionGenerale', 'DRH', 'RH'];
        if (!approverRoles.includes(req.user.role)) {
            return res.status(403).json({ message: 'Non autorisÃ©' });
        }

        const query = { currentApproverId: req.user._id };
        // RH sees all non-terminal leaves too
        if (req.user.role === 'RH') {
            query.$or = [
                { currentApproverId: req.user._id },
                { status: STATES.PENDING_RH },
            ];
            delete query.currentApproverId;
        }

        const leaves = await LeaveRequestModel.find(query)
            .populate('userId', 'firstName lastName email role service department matricule')
            .populate('typeId', 'name code paid requiresCertificateAfterDays')
            .populate('currentApproverId', 'firstName lastName role')
            .sort({ createdAt: -1 });

        res.status(200).json({ leaves });
    } catch (error) {
        res.status(500).json({ message: error.message || 'Erreur interne du serveur' });
    }
};

// â”€â”€â”€ Approve â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const approveLeave = async (req, res) => {
    try {
        const validation = decisionSchema.safeParse(req.body || {});
        if (!validation.success) {
            return res.status(400).json({ errors: validation.error.flatten() });
        }

        const leave = await LeaveRequestModel.findById(req.params.id)
            .populate('typeId');
        if (!leave) {
            return res.status(404).json({ message: 'Demande de congÃ© introuvable' });
        }

        if (leave.certificateRequired && !leave.attachment) {
            return res.status(400).json({ message: "Un certificat est requis avant l'approbation" });
        }

        // WorkflowService handles role/actor validation and state transition
        await workflowService.approve(leave, req.user, validation.data.decisionNote);

        // If the workflow reached APPROVED, deduct the balance
        if (leave.status === STATES.APPROVED && leave.typeId?.paid) {
            const balance = await ensureAccrual(leave.userId, leave.typeId, new Date());
            if (balance.available < leave.days) {
                return res.status(400).json({ message: 'Solde de congÃ©s insuffisant' });
            }
            balance.used += leave.days;
            balance.available = Math.max(0, balance.available - leave.days);
            await balance.save();
        }

        res.status(200).json({ leave });
    } catch (error) {
        if (error.message.includes('non permise') || error.message.includes('pas autorisÃ©') || error.message.includes('approbateur')) {
            return res.status(403).json({ message: error.message });
        }
        res.status(500).json({ message: error.message || 'Erreur interne du serveur' });
    }
};

// â”€â”€â”€ Reject â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const rejectLeave = async (req, res) => {
    try {
        const validation = decisionSchema.safeParse(req.body || {});
        if (!validation.success) {
            return res.status(400).json({ errors: validation.error.flatten() });
        }

        const leave = await LeaveRequestModel.findById(req.params.id);
        if (!leave) {
            return res.status(404).json({ message: 'Demande de congÃ© introuvable' });
        }

        await workflowService.reject(leave, req.user, validation.data.decisionNote);

        res.status(200).json({ leave });
    } catch (error) {
        if (error.message.includes('non permise') || error.message.includes('pas autorisÃ©') || error.message.includes('approbateur')) {
            return res.status(403).json({ message: error.message });
        }
        res.status(500).json({ message: error.message || 'Erreur interne du serveur' });
    }
};

// â”€â”€â”€ Modify (propose different dates/days) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const modifyLeave = async (req, res) => {
    try {
        const validation = modifyLeaveSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({ errors: validation.error.flatten() });
        }

        const leave = await LeaveRequestModel.findById(req.params.id);
        if (!leave) {
            return res.status(404).json({ message: 'Demande de congÃ© introuvable' });
        }

        const { startDate, endDate, comment } = validation.data;
        const start = toDateOnly(startDate);
        const end = toDateOnly(endDate);
        if (!start || !end) return res.status(400).json({ message: 'Dates invalides' });
        if (end < start) return res.status(400).json({ message: 'La date de fin doit Ãªtre aprÃ¨s la date de dÃ©but' });

        const countryCode = getCountryCode(req.user);
        const holidayKeys = await getHolidayKeys(countryCode, start, end);
        const days = calculateBusinessDays(start, end, holidayKeys);
        if (days <= 0) {
            return res.status(400).json({ message: 'Aucun jour ouvrable dans la pÃ©riode proposÃ©e' });
        }

        await workflowService.modify(leave, req.user, { days, startDate: start, endDate: end, comment });

        res.status(200).json({ leave });
    } catch (error) {
        if (error.message.includes('non permise') || error.message.includes('pas autorisÃ©') || error.message.includes('approbateur')) {
            return res.status(403).json({ message: error.message });
        }
        res.status(500).json({ message: error.message || 'Erreur interne du serveur' });
    }
};

// â”€â”€â”€ Employee responds to modification â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const respondToModification = async (req, res) => {
    try {
        const { accept, comment } = req.body;
        const leave = await LeaveRequestModel.findById(req.params.id);
        if (!leave) {
            return res.status(404).json({ message: 'Demande de congÃ© introuvable' });
        }

        if (accept) {
            await workflowService.acceptModification(leave, req.user, comment);
        } else {
            await workflowService.refuseModification(leave, req.user, comment);
        }

        res.status(200).json({ leave });
    } catch (error) {
        if (error.message.includes('pas en attente') || error.message.includes('employÃ© concernÃ©')) {
            return res.status(403).json({ message: error.message });
        }
        res.status(500).json({ message: error.message || 'Erreur interne du serveur' });
    }
};

// â”€â”€â”€ Cancel (employee) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const cancelLeave = async (req, res) => {
    try {
        const leave = await LeaveRequestModel.findById(req.params.id);
        if (!leave) {
            return res.status(404).json({ message: 'Demande de congÃ© introuvable' });
        }

        await workflowService.cancel(leave, req.user, req.body?.comment);

        res.status(200).json({ leave });
    } catch (error) {
        if (error.message.includes('employÃ© concernÃ©') || error.message.includes('clÃ´turÃ©e')) {
            return res.status(403).json({ message: error.message });
        }
        res.status(500).json({ message: error.message || 'Erreur interne du serveur' });
    }
};

// â”€â”€â”€ Attachment upload â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const uploadLeaveAttachment = async (req, res) => {
    try {
        const validation = attachmentSchema.safeParse(req.body || {});
        if (!validation.success) {
            return res.status(400).json({ errors: validation.error.flatten() });
        }

        const leave = await LeaveRequestModel.findById(req.params.id).populate('typeId');
        if (!leave) return res.status(404).json({ message: 'Demande de congÃ© introuvable' });
        if (String(leave.userId) !== String(req.user._id)) {
            return res.status(403).json({ message: 'Non autorisÃ©' });
        }

        const isSickLeave = leave.typeId?.code === 'SICK';
        const twoDaysMs = 2 * 24 * 60 * 60 * 1000;
        const withinUploadWindow = (Date.now() - new Date(leave.createdAt).getTime()) <= twoDaysMs;

        if (isSickLeave && withinUploadWindow) {
            // Allowed
        } else if (TERMINAL_STATES.includes(leave.status)) {
            return res.status(400).json({ message: 'Cette demande a dÃ©jÃ  Ã©tÃ© clÃ´turÃ©e' });
        }

        if (!leave.certificateRequired && !isSickLeave) {
            return res.status(400).json({ message: 'Aucun certificat requis pour ce congÃ©' });
        }

        leave.attachment = validation.data.attachment;
        leave.certificateUploadedAt = new Date();
        await leave.save();

        await saveLog(`Certificat mÃ©dical ajoutÃ© par ${req.user.firstName} ${req.user.lastName}`, req.user._id);

        res.status(200).json({ leave });
    } catch (error) {
        res.status(500).json({ message: error.message || 'Erreur interne du serveur' });
    }
};

// â”€â”€â”€ Accrual â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const runAccrualManual = async (req, res) => {
    try {
        if (req.user.role !== 'RH') {
            return res.status(403).json({ message: 'Non autorisÃ©' });
        }
        const processed = await runMonthlyAccrual();
        await saveLog(
            `Calcul d'accrual lancÃ© manuellement par ${req.user.firstName} ${req.user.lastName} : ${processed} soldes mis Ã  jour`,
            req.user._id
        );
        res.status(200).json({ message: "Calcul d'accrual effectuÃ©", processed });
    } catch (error) {
        res.status(500).json({ message: error.message || 'Erreur interne du serveur' });
    }
};

// â”€â”€â”€ Current absences (RH only) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const listCurrentAbsences = async (req, res) => {
    try {
        const { role, _id } = req.user;
        const approverRoles = ['ChefDeService', 'Direction', 'DirectionGenerale', 'DRH', 'RH'];
        if (!approverRoles.includes(role)) {
            return res.status(403).json({ message: 'Non autorisé' });
        }

        // Build the list of user IDs this person can see
        let visibleUserIds;
        if (role === 'DRH' || role === 'RH') {
            // Full org visibility
            const allUsers = await userModel.find({}).select('_id').lean();
            visibleUserIds = allUsers.map((u) => u._id);
        } else {
            // Use $graphLookup to get subordinate tree
            const maxDepth = { ChefDeService: 0, Direction: 1, DirectionGenerale: 2 }[role] ?? 10;
            const [result] = await userModel.aggregate([
                { $match: { _id } },
                {
                    $graphLookup: {
                        from: 'users',
                        startWith: '$_id',
                        connectFromField: '_id',
                        connectToField: 'managerId',
                        as: 'subordinates',
                        maxDepth,
                        depthField: 'depth',
                    },
                },
                { $project: { 'subordinates._id': 1 } },
            ]);
            visibleUserIds = (result?.subordinates || []).map((u) => u._id);
        }

        const { date, typeId } = req.query;
        const targetDate = date ? new Date(date) : new Date();

        const query = {
            status: STATES.APPROVED,
            startDate: { $lte: targetDate },
            endDate: { $gte: targetDate },
            userId: { $in: visibleUserIds },
        };
        if (typeId) query.typeId = typeId;

        const leaves = await LeaveRequestModel.find(query)
            .populate('userId', 'firstName lastName email avatar role managerId service department matricule')
            .populate('typeId', 'name code')
            .populate('managerId', 'firstName lastName')
            .sort({ startDate: 1 })
            .lean();

        res.status(200).json({ absences: leaves });
    } catch (error) {
        res.status(500).json({ message: error.message || 'Erreur interne du serveur' });
    }
};

// â”€â”€â”€ Workflow History for a leave request â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const getLeaveHistory = async (req, res) => {
    try {
        const leave = await LeaveRequestModel.findById(req.params.id)
            .populate('workflowHistory.actorId', 'firstName lastName role')
            .select('status workflowHistory userId');

        if (!leave) return res.status(404).json({ message: 'Demande introuvable' });

        // Only the employee, current approver, or RH/DRH can see history
        const isOwner = String(leave.userId) === String(req.user._id);
        const isRH = req.user.role === 'RH' || req.user.role === 'DRH';
        if (!isOwner && !isRH) {
            return res.status(403).json({ message: 'Non autorisÃ©' });
        }

        res.status(200).json({ history: leave.workflowHistory, status: leave.status });
    } catch (error) {
        res.status(500).json({ message: error.message || 'Erreur interne du serveur' });
    }
};

module.exports = {
    getLeaveTypes,
    getLeaveTypeById,
    createLeaveType,
    updateLeaveType,
    deactivateLeaveType,
    requestLeave,
    listMyLeaves,
    getLeaveBalances,
    listPendingApprovals,
    approveLeave,
    rejectLeave,
    modifyLeave,
    respondToModification,
    cancelLeave,
    uploadLeaveAttachment,
    runAccrualManual,
    listCurrentAbsences,
    getLeaveHistory,
};
