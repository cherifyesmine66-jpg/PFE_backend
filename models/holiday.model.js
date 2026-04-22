const mongoose = require('mongoose');

const holidaySchema = new mongoose.Schema(
    {
        countryCode: {
            type: String,
            required: true,
            uppercase: true,
            trim: true
        },
        date: {
            type: Date,
            required: true
        },
        name: {
            type: String,
            required: true
        },
        description: {
            type: String
        }
    },
    { timestamps: true }
);

holidaySchema.index({ countryCode: 1, date: 1 }, { unique: true });

const HolidayModel = mongoose.model('Holiday', holidaySchema);
module.exports = HolidayModel;
