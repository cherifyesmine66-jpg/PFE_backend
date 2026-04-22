const express = require('express');
//back et front (request de frontend)
const cors= require('cors');
const path=require('path');

const app = express();

// Initialize workflow services (wires EventEmitter listeners for audit + notifications)
require('./services');

const authRouter=require("./routes/auth.route");
const userRouter = require('./routes/user.route');
const fileRouter=require('./routes/file.route');
const logsRouter=require('./routes/logs.routes');
const leavesRouter = require('./routes/leaves.route');
const holidaysRouter = require('./routes/holidays.route');
const resourcesRouter = require('./routes/resources.route');
const attestationsRouter = require('./routes/attestations.route');
//pour serveur comprendre les données envoyer par frontend(json)
app.use(express.json());

app.use(cors("http://localhost:5173"));

app.use('/uploads',express.static(path.join(__dirname,'uploads')))
// base path
app.use('/user', userRouter);
app.use('/auth',authRouter);
app.use('/file',fileRouter);
app.use('/logs',logsRouter);
app.use('/leaves', leavesRouter);
app.use('/holidays', holidaysRouter);
app.use('/resources', resourcesRouter);
app.use('/attestations', attestationsRouter);

module.exports = app;