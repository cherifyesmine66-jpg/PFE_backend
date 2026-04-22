const jwt =require ('jsonwebtoken')

function generateToken(userId){
    return jwt.sign(
        {id: userId},// Payload : seulement l'ID, pas le rôle (bon)
        process.env.JWT_SECRET,// Clé secrète depuis .env
        {expiresIn:"7d"}// Expiration 7 jours

    )


}
module.exports={generateToken}