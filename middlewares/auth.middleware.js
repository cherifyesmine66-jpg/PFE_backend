const protect = async (req, res, next) => {
  const jwt = require("jsonwebtoken");
  const userModel = require("../models/user.model");
  try {
    //1.get toen from headers
    let token;
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer")
    ) {
      token = req.headers.authorization.split(" ")[1];// Extrait le token après "Bearer "
    }
    //2.check token if exist
    if (!token) {
      return res
        .status(401)
        .json({ status: false, message: "Non autorisé, aucun token fourni" });
    }

    //3.verify token
    const decodedToken = jwt.verify(token, process.env.JWT_SECRET);

    //4.chek if user exist on database
    const user = await userModel.findById(decodedToken.id).select("-password");
    if (!user) {
      return res
        .status(401)
        .json({ status: false, message: "Non autorisé, utilisateur introuvable" });
    }

    //5.attach user to object request
    req.user = user;
    next();
  } catch (error) {
    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({ status: false, message: "Token invalide" });
    }
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ status: false, message: "Token expiré" });
    }
    return res
      .status(500)
      .json({
        status: false,
        message: "Échec de l'authentification",
        error: error.message,
      });
  }
};
module.exports = { protect };
