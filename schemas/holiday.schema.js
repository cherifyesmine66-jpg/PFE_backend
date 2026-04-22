const { z } = require('zod');

const createHolidaySchema = z.object({
    countryCode: z.string().min(2).max(3),
    date: z.string().min(1, { message: 'La date est requise' }),
    name: z.string().min(1, { message: 'Le nom est requis' }),
    description: z.string().optional().nullable()
});

module.exports = { createHolidaySchema };
