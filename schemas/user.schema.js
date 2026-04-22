const {z}=require ('zod');
const createUserSchema=z.object({
    email: z.string('email is required').email({message:"Invalid email format"}),
    firstName: z.string().min(1,{message:"First name is required"}),
    lastName: z.string().min(1,{message:"Last name is required"}),
    password: z.string()
        .min(8,{message:"Password must be greater than 8 chars"})
        .max(32,{message:"Password must be less than 32 chars"}),
    confirmPassword:z.string()
        .min(8,{message:"Confirm password must be greater than 8 chars"})
        .max(32,{message:"Confirm password must be less than 32 chars"}),
    dob:z.string().optional().nullable(),
    role: z.enum(["Employee","ChefDeService","Direction","DirectionGenerale","DRH","RH"]).optional().nullable(),
    managerId: z.string().optional().nullable(),
    matricule: z.string().optional().nullable(),
    service: z.string().optional().nullable(),
    department: z.string().optional().nullable(),
    countryCode: z.string().min(2).max(3).optional().nullable(),
    avatar:z.string().optional().nullable(),
    salary: z.number().min(0).optional().nullable(),
});


const updateUserSchema = z.object({
    email: z.string('email is required').email({ message: "Invalid email format" }),
    firstName: z.string().min(1, { message: "First name is required" }),
    lastName: z.string().min(1, { message: "Last name is required" }),
    password: z.string()
        .min(8, { message: "Password must be greater than 8 chars" })
        .max(32, { message: "Password must be less than 32 chars" })
        .optional(),
    confirmPassword: z.string()
        .min(8, { message: "Confirm password must be greater than 8 chars" })
        .max(32, { message: "Confirm password must be less than 32 chars" })
        .optional(),
    dob: z.string().optional().nullable(),
    role: z.enum(["Employee","ChefDeService","Direction","DirectionGenerale","DRH","RH"]).optional().nullable(),
    managerId: z.string().optional().nullable(),
    matricule: z.string().optional().nullable(),
    service: z.string().optional().nullable(),
    department: z.string().optional().nullable(),
    countryCode: z.string().min(2).max(3).optional().nullable(),
    avatar:z.string().optional().nullable(),
    salary: z.number().min(0).optional().nullable(),
});
module.exports ={createUserSchema,updateUserSchema}