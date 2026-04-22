const { z } = require('zod');

const createResourceSchema = z.object({
    name: z.string().min(1, { message: 'Le nom est obligatoire' }),
    category: z.string().min(1, { message: 'La catégorie est obligatoire' }),
    description: z.string().max(500).optional().nullable(),
    totalQuantity: z.number().int().min(0, { message: 'La quantité doit être >= 0' }),
    availableQuantity: z.number().int().min(0, { message: 'La quantité disponible doit être >= 0' })
});

const updateResourceSchema = z.object({
    name: z.string().min(1).optional(),
    category: z.string().min(1).optional(),
    description: z.string().max(500).optional().nullable(),
    totalQuantity: z.number().int().min(0).optional(),
    availableQuantity: z.number().int().min(0).optional()
});

const createResourceRequestSchema = z.object({
    resourceType: z.string().min(1, { message: 'Le type de ressource est obligatoire' }),
    description: z.string().max(500).optional().nullable()
});

// DRH forwards to RH (optional note)
const resourceForwardSchema = z.object({
    decisionNote: z.string().max(500).optional().nullable()
});

// RH rejects (optional note, no resourceId needed)
const resourceDecisionSchema = z.object({
    decisionNote: z.string().max(500).optional().nullable()
});

// RH approves (mandatory resourceId + optional note)
const resourceApprovalSchema = z.object({
    decisionNote: z.string().max(500).optional().nullable(),
    resourceId: z.string().min(1, { message: 'La ressource est obligatoire pour approuver' })
});

module.exports = {
    createResourceSchema,
    updateResourceSchema,
    createResourceRequestSchema,
    resourceForwardSchema,
    resourceDecisionSchema,
    resourceApprovalSchema
};
