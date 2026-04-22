const nodemailer=require("nodemailer");

async function sendEmail(options){
    const transporter = nodemailer.createTransport({
        host:process.env.SMTP_HOST,
        port:process.env.SMTP_PORT,
        auth:{
            user:process.env.SMTP_USER,
            pass:process.env.SMTP_PASS,
        }
    });

    const recipients = Array.isArray(options.mail)
        ? options.mail.filter(Boolean).join(',')
        : options.mail;

    const mailOptions={
        from:process.env.SMTP_USER +"<Service Info>",
        to:recipients,
        subject:options.subject,
        text:options.content
    };
    const info =await transporter.sendMail (mailOptions);

    console.log(info);
    return info;

}
module.exports=sendEmail;