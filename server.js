const dotenv=require('dotenv');
const mongoose =require('mongoose');
const app = require('./app');
const { startScheduler } = require('./utils/scheduler');

dotenv.config();

const mongoCon=process.env.MONGO_URI;
mongoose.connect(mongoCon).then(()=>{
    console.log("database connection established succesfully.");
    startScheduler();
    app.listen(3000, () => {
  console.log("Server is running on http://localhost:3000");
});
    

}).catch((error)=>{ 
    console.log("Database connection failed:",error.message);  
})


