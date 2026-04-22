const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/auth.middleware');
const {
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
} = require('../Controllers/users.controller');

router.post('/create', protect, createUser);
router.get('/me', protect, getMe);
router.get('/team', protect, getMyTeam);
router.put('/profile', protect, updateMyProfile);

// Hierarchical visibility — returns full subordinate tree for the current user
router.get('/subordinates', protect, getSubordinates);
// Leaves for all subordinates (dashboard visibility per role)
router.get('/subordinates/leaves', protect, getSubordinatesLeaves);

// DRH/RH only — search employee by matricule with full hierarchy chain
router.get('/employee/:matricule', protect, getEmployeeByMatricule);

router.get('/get/:id', protect, getUserById);
router.get('/', protect, listUsers);
router.put('/update/:id', protect, updateUserById);
router.delete('/delete/:id', protect, deleteUserById);

module.exports = router;