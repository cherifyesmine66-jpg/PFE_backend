const userModel= require('../models/user.model');
const {loginSchema}=require('../schemas/auth.schema');
const{generateToken}=require('../utils/jwt');
const {saveLog}=require('../utils/logger');
async function login(req,res){
    try {
        const validation = loginSchema.safeParse(req.body);
        if(!validation.success){
            return res.status(400).json({
                errors:validation.error.flatten()
            })
        }

        const {email,password}=req.body;
        //find user by email
        const user=await userModel.findOne({email}).select("+password");

        //cas1:user not found->return error
        if(!user){
            return res.status(400).json({
                status:false,
                message:"Identifiants invalides"
            });
        }
        //case2:user found ->check password

        const passwordMatch=await user.comparePassword(password);
        //case2.1:password incorect ->return error
        if(!passwordMatch){
            return res.status(400).json({
                status:false,
                message:"Identifiants invalides"
            });
        }
        //case2.2:password correct ->generete auth token
        const token=generateToken(user._id);
        await saveLog(
            `Connexion de ${user.firstName} ${user.lastName}`,
            user._id
        );
        res.status(200).json({
            message:"Connexion réussie",
            token
        })
        
    } catch (error) {
        res.status(500).json({
            status:false,
            message:error.message||"Erreur interne du serveur"

        })


        
    }
}

module.exports={login}
