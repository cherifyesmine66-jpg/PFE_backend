function uploadFile(req,res){
    if(!req.file){
        return res.status(400).json({
            status:false,
            message:"No file uploaded"
        })

    };
    res.status(201).json({
        status:true,
        message:"File Uploaded Successfully ",
        file:{
            originalName:req.file.originalname,
            filename:req.file.filename,
            mimetype:req.file.mimetype,
            size:req.file.size,
            path:req.file.path
        }
    })

}
module.exports={uploadFile}