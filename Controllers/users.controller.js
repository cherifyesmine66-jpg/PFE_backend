const userModel = require("../models/user.model");
const LeaveRequestModel = require('../models/leave-request.model');
const LeaveBalanceModel = require('../models/leave-balance.model');
const ResourceRequestModel = require('../models/resource-request.model');
const LogModel = require('../models/log-model');
const sendEmail= require("../utils/mailer");
const {createUserSchema,updateUserSchema}=require("../schemas/user.schema");
const {saveLog}=require("../utils/logger");

// ─── Hierarchy rules ─────────────────────────────────────────────────────────
// Each role MUST have a direct manager of the specified role.
const REQUIRED_MANAGER_ROLE = {
    Employee: 'ChefDeService',
    ChefDeService: 'Direction',
    Direction: 'DirectionGenerale',
    DirectionGenerale: 'DRH',
    DRH: 'RH',
};

const ROLE_LABELS_FR = {
    Employee: 'Employé',
    ChefDeService: 'Chef de Service',
    Direction: 'Sous-Directeur',
    DirectionGenerale: 'Directeur',
    DRH: 'DRH',
    RH: 'RH',
};

/**
 * Validate that the provided managerId exists and has the correct role
 * for the given user role.  Returns an error message string or null if valid.
 */
async function validateHierarchy(role, managerId) {
    if (!role) return null;
    const requiredManagerRole = REQUIRED_MANAGER_ROLE[role];
    if (!requiredManagerRole) return null; // RH needs no manager

    if (!managerId) {
        return `Un ${ROLE_LABELS_FR[role]} doit être rattaché à un manager hiérarchique direct (${ROLE_LABELS_FR[requiredManagerRole]})`;
    }

    const manager = await userModel.findById(managerId);
    if (!manager) return 'Manager introuvable';

    if (manager.role !== requiredManagerRole) {
        return `Un ${ROLE_LABELS_FR[role]} doit avoir un ${ROLE_LABELS_FR[requiredManagerRole]} comme manager direct (rôle reçu : ${manager.role})`;
    }
    return null;
}

async function createUser(req, res) {

  try {
    const validation =createUserSchema.safeParse(req.body);
    if(!validation.success){
      return res.status(400).json({
      errors:validation.error.flatten()
      })
    }
    const { email, managerId, role } = req.body;
    const existingUser = await userModel.findOne({ email });
    if (existingUser) {
        return res.status(400).json({ message: "Un utilisateur avec cet email existe déjà." });
    }

    const hierarchyError = await validateHierarchy(role, managerId);
    if (hierarchyError) {
        return res.status(400).json({ message: hierarchyError });
    }



    const user = new userModel({
      ...req.body,
    });
    await user.save();

    //Sent Mail
    const options={
      mail:email,
      subject:"Welcome to our platform",
      content:"Welcome " + user.firstName + " to our platform." 
    }

    await sendEmail(options);

    await saveLog(
    `Utilisateur ${user.firstName} ${user.lastName} créé par ${req.user.firstName} ${req.user.lastName}`,
    req.user._id
);

    res.status(201).json({
      message: "Utilisateur " + req.body.firstName + " créé avec succès.",
      user: user,
    });
  } catch (error) {
    console.log(error.message);
    res.status(500).json({
      message: error.message || "Erreur interne du serveur",
    });
  }
}

async function getUserById(req, res) {
  try {
    const id=req.params.id;
    const user =await userModel.findById(id);
    if(!user){
       return res.status(404).json({
            message:"Utilisateur introuvable"
       });
    };
 

  res.status(200).json({
      user 
  });
   } catch (error) {
    console.log(error.message);
    res.status(500).json({
      message: "Erreur interne du serveur",
    });
    
  }
};

async function deleteUserById(req, res) {
  try {
    if (req.user.role !== 'RH') {
      return res.status(403).json({ message: 'Non autorisé' });
    }

    const id = req.params.id;

    if (String(id) === String(req.user._id)) {
      return res.status(400).json({ message: 'Vous ne pouvez pas supprimer votre propre compte' });
    }

    const existingUser = await userModel.findById(id);

    if (!existingUser) {
      return res.status(404).json({
        message: "Utilisateur introuvable",
      });
    }

    // Cascade: remove related data
    await LeaveRequestModel.deleteMany({ userId: id });
    await LeaveBalanceModel.deleteMany({ userId: id });
    await ResourceRequestModel.deleteMany({ userId: id });
    await LogModel.deleteMany({ actorId: id });

    // Unassign subordinates whose manager is the deleted user
    await userModel.updateMany({ managerId: id }, { $set: { managerId: null } });

    await userModel.findByIdAndDelete(id);

    await saveLog(
      `Utilisateur ${existingUser.firstName} ${existingUser.lastName} supprimé par ${req.user.firstName} ${req.user.lastName}`,
      req.user._id
    );

    return res.status(200).json({
      message: `Utilisateur ${existingUser.firstName} ${existingUser.lastName} supprimé avec succès`
    });
    
  } catch (error) {
    console.log(error.message);
    return res.status(500).json({
      message: "Erreur interne du serveur",
    });
  }
}

async function listUsers(req,res) {
    try {
        const users = await userModel.find();
        res.status(200).json({
            users
        })
        
    } catch (error) {
    console.log(error.message);
    return res.status(500).json({
      message: "Erreur interne du serveur",
    });
}
}



async function updateUserById(req, res) {
  try {
    if (req.user.role !== 'RH') {
      return res.status(403).json({ message: 'Non autorisé' });
    }
    const validation = updateUserSchema.safeParse(req.body);
    if(!validation.success){
      return res.status(400).json({
      errors:validation.error.flatten()
      })
    }
    const { id } = req.params;
    const { managerId } = req.body;

    const existingUser = await userModel.findById(id);
    if (!existingUser) {
      return res.status(404).json({
        status: false,
        message: "Utilisateur introuvable",
      });
    }

    if (managerId && String(managerId) === String(id)) {
        return res.status(400).json({ message: "Un utilisateur ne peut pas être son propre manager" });
    }

    const { role: newRole } = req.body;
    const hierarchyErr = await validateHierarchy(newRole, managerId);
    if (hierarchyErr) {
        return res.status(400).json({ message: hierarchyErr });
    }

    const updatedUser = await userModel.findByIdAndUpdate(
      id,
      req.body,
      {
        new: true,          
        runValidators: true 
      }
    );
    await saveLog(
      `Utilisateur ${updatedUser.firstName} ${updatedUser.lastName} modifié par ${req.user.firstName} ${req.user.lastName}`,
      req.user._id
    );

    res.status(200).json({
      status: true,
      user: updatedUser,
      message: "Utilisateur mis à jour avec succès",
    });

  } catch (error) {
    console.log(error.message);
    return res.status(500).json({
      message: "Erreur interne du serveur",
    });
  }
}

async function getMe(req, res) {
  try {
    res.status(200).json({
      user: req.user
    });
  } catch (error) {
    res.status(500).json({
      message: error.message || "Erreur interne du serveur",
    });
  }
}

async function getMyTeam(req, res) {
  try {
    const teamMembers = await userModel.find({ managerId: req.user._id }).lean();
    if (teamMembers.length === 0) return res.status(200).json({ team: [] });

    const today = new Date();
    const userIds = teamMembers.map((u) => u._id);

    const activeLeaves = await LeaveRequestModel.find({
      userId: { $in: userIds },
      status: 'APPROVED',
      startDate: { $lte: today },
      endDate: { $gte: today }
    }).select('userId').lean();

    const onLeaveIds = new Set(activeLeaves.map((l) => String(l.userId)));

    const team = teamMembers.map((u) => ({
      ...u,
      isOnLeave: onLeaveIds.has(String(u._id))
    }));

    res.status(200).json({ team });
  } catch (error) {
    res.status(500).json({ message: 'Erreur interne du serveur' });
  }
}

async function updateMyProfile(req, res) {
  try {
    const { avatar, password, confirmPassword } = req.body;

    if (password) {
      if (password !== confirmPassword) {
        return res.status(400).json({ message: 'Les mots de passe ne correspondent pas' });
      }
      const user = await userModel.findById(req.user._id).select('+password +confirmPassword');
      if (!user) return res.status(404).json({ message: 'Utilisateur introuvable' });
      user.password = password;
      user.confirmPassword = confirmPassword;
      if (avatar !== undefined) user.avatar = avatar;
      await user.save();
    } else if (avatar !== undefined) {
      await userModel.findByIdAndUpdate(req.user._id, { avatar });
    }

    await saveLog(
      `Profil mis à jour par ${req.user.firstName} ${req.user.lastName}`,
      req.user._id
    );
    res.status(200).json({ message: 'Profil mis à jour avec succès' });
  } catch (error) {
    res.status(500).json({ message: error.message || 'Erreur interne du serveur' });
  }
}

/**
 * GET /user/employee/:matricule
 * DRH/RH only — lookup employee by matricule,
 * return profile + full hierarchy chain up to DirectionGenerale.
 */
async function getEmployeeByMatricule(req, res) {
  try {
    if (req.user.role !== 'DRH' && req.user.role !== 'RH') {
      return res.status(403).json({ message: 'Non autorisé — réservé aux DRH/RH' });
    }

    const { matricule } = req.params;
    const employee = await userModel.findOne({ matricule });
    if (!employee) {
      return res.status(404).json({ message: 'Employé introuvable avec ce matricule' });
    }

    // Build full hierarchy chain
    const hierarchy = [];
    const visited = new Set();
    let current = employee;

    while (current.managerId) {
      if (visited.has(String(current.managerId))) break;
      visited.add(String(current.managerId));

      const manager = await userModel.findById(current.managerId)
        .select('firstName lastName role service department matricule');
      if (!manager) break;

      hierarchy.push({
        _id: manager._id,
        firstName: manager.firstName,
        lastName: manager.lastName,
        role: manager.role,
        service: manager.service,
        department: manager.department,
        matricule: manager.matricule,
      });
      current = manager;
    }

    res.status(200).json({
      employee: {
        _id: employee._id,
        firstName: employee.firstName,
        lastName: employee.lastName,
        email: employee.email,
        role: employee.role,
        service: employee.service,
        department: employee.department,
        matricule: employee.matricule,
      },
      hierarchy,
    });
  } catch (error) {
    res.status(500).json({ message: error.message || 'Erreur interne du serveur' });
  }
}

/**
 * GET /user/subordinates
 * Returns the full subtree of users reporting under the authenticated user.
 *
 * - Employee            → empty list (no subordinates)
 * - ChefDeService       → direct reports only (depth 0)
 * - Direction           → ChefDeService + their employees (depth 0-1)
 * - DirectionGenerale   → Direction + ChefDeService + employees (depth 0-2)
 * - DRH / RH            → entire organisation
 *
 * Uses MongoDB $graphLookup for efficient recursive traversal.
 * Response includes each user's depth from the requester.
 */
async function getSubordinates(req, res) {
    try {
        const { role, _id } = req.user;

        // DRH and RH have full org visibility — return everyone except themselves
        if (role === 'DRH' || role === 'RH') {
            const users = await userModel
                .find({ _id: { $ne: _id } })
                .select('-password -confirmPassword')
                .lean();
            return res.status(200).json({ subordinates: users });
        }

        // Employee has no subordinates
        if (role === 'Employee') {
            return res.status(200).json({ subordinates: [] });
        }

        // For ChefDeService / Direction / DirectionGenerale use $graphLookup
        const maxDepth = {
            ChefDeService: 0,       // direct reports only
            Direction: 1,           // ChefDeService + their employees
            DirectionGenerale: 2,   // Direction + ChefDeService + employees
        }[role] ?? 10;

        const [result] = await userModel.aggregate([
            { $match: { _id: _id } },
            {
                $graphLookup: {
                    from: 'users',
                    startWith: '$_id',
                    connectFromField: '_id',
                    connectToField: 'managerId',
                    as: 'subordinates',
                    maxDepth,
                    depthField: 'depth',
                    restrictSearchWithMatch: {},
                },
            },
            {
                $project: {
                    'subordinates.password': 0,
                    'subordinates.confirmPassword': 0,
                },
            },
        ]);

        const subordinates = (result?.subordinates || []).sort((a, b) => a.depth - b.depth);
        res.status(200).json({ subordinates });
    } catch (error) {
        res.status(500).json({ message: error.message || 'Erreur interne du serveur' });
    }
}

/**
 * GET /user/subordinates/leaves
 * Returns all leave requests (any status) for the authenticated user's subordinate tree.
 * Useful for role-based dashboard visibility.
 */
async function getSubordinatesLeaves(req, res) {
    try {
        const { role, _id } = req.user;

        let userIds;

        if (role === 'DRH' || role === 'RH') {
            // Full org
            const allUsers = await userModel.find({}).select('_id').lean();
            userIds = allUsers.map((u) => u._id);
        } else if (role === 'Employee') {
            return res.status(200).json({ leaves: [] });
        } else {
            const maxDepth = { ChefDeService: 0, Direction: 1, DirectionGenerale: 2 }[role] ?? 10;
            const [result] = await userModel.aggregate([
                { $match: { _id } },
                {
                    $graphLookup: {
                        from: 'users',
                        startWith: '$_id',
                        connectFromField: '_id',
                        connectToField: 'managerId',
                        as: 'subordinates',
                        maxDepth,
                        depthField: 'depth',
                    },
                },
                { $project: { 'subordinates._id': 1 } },
            ]);
            userIds = (result?.subordinates || []).map((u) => u._id);
        }

        const leaves = await LeaveRequestModel.find({ userId: { $in: userIds } })
            .populate('userId', 'firstName lastName email role service department matricule')
            .populate('typeId', 'name code paid')
            .populate('currentApproverId', 'firstName lastName role')
            .sort({ createdAt: -1 })
            .lean();

        res.status(200).json({ leaves });
    } catch (error) {
        res.status(500).json({ message: error.message || 'Erreur interne du serveur' });
    }
}

module.exports = {
    createUser,
    getUserById,
    updateUserById,
    deleteUserById,
    listUsers,
    getMe,
    getMyTeam,
    updateMyProfile,
    getEmployeeByMatricule,
    getSubordinates,
    getSubordinatesLeaves,
};

