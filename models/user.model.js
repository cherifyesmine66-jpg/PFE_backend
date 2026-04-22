const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
    },
    firstName: {
      type: String,
      required: true,
    },
    lastName: {
      type: String,
      required: true,
    },
    password: {
      type: String,
      required: true,
      minlength: 8,
      select: false,
    },
    confirmPassword: {
      type: String,
      required: true,
      minlength: 8,
      select: false,
    },
    dob: {
      type: Date,
    },
    role: {
      type: String,
      enum: [
        "Employee",
        "ChefDeService",
        "Direction",
        "DirectionGenerale",
        "DRH",
        "RH",
      ],
      default: "Employee",
    },
    managerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
    },
    matricule: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
    },
    service: {
      type: String,
      trim: true,
    },
    department: {
      type: String,
      trim: true,
    },
    countryCode: {
      type: String,
      uppercase: true,
      trim: true,
      default: "TN",
    },
    avatar: {
      type: String,
    },
    salary: {
      type: Number,
      min: 0,
    },
  },
  { timestamps: true },
);

userSchema.pre("save", async function () {
  if (!this.isModified("password")) return; // N'exécute que si password a changé
  if (this.password !== this.confirmPassword) {
    // Vérifie la correspondance AVANT le hash
    throw new Error("Les mots de passe ne correspondent pas");
  }
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt); // Remplace le mot de passe en clair
  this.confirmPassword = undefined; // Empêche la persistance de confirmPassword
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password); // Compare en-clair vs hash
};

const userModel = mongoose.model("users", userSchema);

module.exports = userModel;
