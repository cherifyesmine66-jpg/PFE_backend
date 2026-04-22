const express= require ('express');
const{login}=require('../Controllers/auth.controller');

const router=express.Router();

router.post('/login',login);
module.exports=router;
