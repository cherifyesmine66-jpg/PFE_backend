const HolidayModel = require('../models/holiday.model');
const { createHolidaySchema } = require('../schemas/holiday.schema');
const { toDateOnly } = require('../utils/leave');

const listHolidays = async (req, res) => {
    try {
        const countryCode = (req.query.country || req.user.countryCode || 'DEFAULT').toUpperCase();
        const holidays = await HolidayModel.find({ countryCode }).sort({ date: 1 });
        res.status(200).json({ holidays });
    } catch (error) {
        res.status(500).json({ message: error.message || 'Erreur interne du serveur' });
    }
};

const createHoliday = async (req, res) => {
    try {
        if (req.user.role !== 'RH') {
            return res.status(403).json({ message: 'Non autorisé' });
        }

        const validation = createHolidaySchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({ errors: validation.error.flatten() });
        }

        const { countryCode, date, name, description } = validation.data;
        const parsedDate = toDateOnly(date);
        if (!parsedDate) {
            return res.status(400).json({ message: 'Date invalide' });
        }

        const holiday = new HolidayModel({
            countryCode: countryCode.toUpperCase(),
            date: parsedDate,
            name,
            description: description || null
        });
        await holiday.save();

        res.status(201).json({ holiday });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({ message: 'Ce jour férié existe déjà' });
        }
        res.status(500).json({ message: error.message || 'Erreur interne du serveur' });
    }
};

const deleteHoliday = async (req, res) => {
    try {
        if (req.user.role !== 'RH') {
            return res.status(403).json({ message: 'Non autorisé' });
        }

        const holiday = await HolidayModel.findByIdAndDelete(req.params.id);
        if (!holiday) {
            return res.status(404).json({ message: 'Jour férié introuvable' });
        }

        res.status(204).json({});
    } catch (error) {
        res.status(500).json({ message: error.message || 'Erreur interne du serveur' });
    }
};

module.exports = {
    listHolidays,
    createHoliday,
    deleteHoliday
};
