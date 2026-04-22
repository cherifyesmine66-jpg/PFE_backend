const LeaveTypeModel = require('../models/leave-type.model');
const LeaveBalanceModel = require('../models/leave-balance.model');
const userModel = require('../models/user.model');
const { getStartOfMonth, getMonthIndex } = require('./leave');

async function runMonthlyAccrual() {
    const now = new Date();
    const nowMonth = getStartOfMonth(now);
    const previousMonth = getStartOfMonth(
        new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
    );

    const [users, types] = await Promise.all([
        userModel.find({}).lean(),
        LeaveTypeModel.find({ isActive: true, monthlyAccrual: { $gt: 0 } }).lean()
    ]);

    let processed = 0;

    for (const user of users) {
        for (const type of types) {
            let balance = await LeaveBalanceModel.findOne({ userId: user._id, typeId: type._id });

            if (!balance) {
                balance = new LeaveBalanceModel({
                    userId: user._id,
                    typeId: type._id,
                    accrued: 0,
                    used: 0,
                    available: 0,
                    lastAccruedAt: previousMonth
                });
            }

            const lastAccruedAt = balance.lastAccruedAt
                ? getStartOfMonth(balance.lastAccruedAt)
                : previousMonth;

            const monthsToAccrue = getMonthIndex(nowMonth) - getMonthIndex(lastAccruedAt);
            if (monthsToAccrue > 0) {
                const increment = monthsToAccrue * type.monthlyAccrual;
                balance.accrued += increment;
                balance.available += increment;
                balance.lastAccruedAt = nowMonth;
                await balance.save();
                processed++;
            }
        }
    }

    console.log(`[Accrual] Complete: ${processed} balances updated.`);
    return processed;
}

module.exports = { runMonthlyAccrual };
