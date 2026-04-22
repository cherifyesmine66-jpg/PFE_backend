const { z } = require('zod');

const createAttestationRequestSchema = z.object({
    attestationType: z.enum(['WORK', 'SALARY'], {
        required_error: "Le type d'attestation est obligatoire",
    }),
    purpose: z.string().max(500).optional().nullable()
});

// DRH forwards to RH (optional note)
const attestationForwardSchema = z.object({
    decisionNote: z.string().max(500).optional().nullable()
});

// DRH rejects (optional note)
const attestationRejectSchema = z.object({
    decisionNote: z.string().max(500).optional().nullable()
});

// RH generates the attestation — no extra fields needed, note is optional
const attestationGenerateSchema = z.object({
    decisionNote: z.string().max(500).optional().nullable()
});

module.exports = {
    createAttestationRequestSchema,
    attestationForwardSchema,
    attestationRejectSchema,
    attestationGenerateSchema
};
