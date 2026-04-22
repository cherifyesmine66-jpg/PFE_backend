const { z } = require('zod');

const loginSchema = z.object({
  email: z
    .string({ required_error: "Email is required"})
    .email({ message: "Invalid email format" }),

  password: z
    .string()
    .min(8, { message: "Password must be greater than 8 chars" })
    .max(32, { message: "Password must be less than 32 chars" }),
});

module.exports = { loginSchema };