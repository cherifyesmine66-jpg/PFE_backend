const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { uploadFile } = require('../Controllers/file.controller');

const uploadsDir = path.join(__dirname, '..', 'uploads');
const router = express.Router();

if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true }); 
}

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (_req, file, cb) => {
        const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, uniqueName + path.extname(file.originalname));
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

router.post('/upload', upload.single('file'), uploadFile); 

module.exports = router;