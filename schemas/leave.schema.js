const { z } = require('zod');

const createLeaveSchema = z.object({
    typeId: z.string().min(1, { message: 'typeId is required' }),
    startDate: z.string().min(1, { message: 'startDate is required' }),
    endDate: z.string().min(1, { message: 'endDate is required' }),
    reason: z.string().max(500).optional().nullable(),
    attachment: z.string().optional().nullable()
});

const decisionSchema = z.object({
    decisionNote: z.string().max(500).optional().nullable()
});

const modifyLeaveSchema = z.object({
    startDate: z.string().min(1, { message: 'startDate is required' }),
    endDate: z.string().min(1, { message: 'endDate is required' }),
    comment: z.string().max(500).optional().nullable()
});

const attachmentSchema = z.object({
    attachment: z.string().min(1, { message: 'attachment is required' })
});

const createLeaveTypeSchema = z.object({
    name: z.string().min(1, { message: 'name is required' }),
    code: z.string().min(1, { message: 'code is required' }),
    paid: z.boolean().optional(),
    monthlyAccrual: z.number().min(0).optional(),
    requiresCertificateAfterDays: z.number().min(1).optional().nullable()
});

const updateLeaveTypeSchema = z.object({
    name: z.string().min(1).optional(),
    paid: z.boolean().optional(),
    monthlyAccrual: z.number().min(0).optional(),
    requiresCertificateAfterDays: z.number().min(1).optional().nullable(),
    isActive: z.boolean().optional()
});

module.exports = {
    createLeaveSchema,
    decisionSchema,
    modifyLeaveSchema,
    attachmentSchema,
    createLeaveTypeSchema,
    updateLeaveTypeSchema
};
