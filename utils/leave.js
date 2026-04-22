const toDateOnly = (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return null;
    }
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
};

const toDateKey = (date) => date.toISOString().slice(0, 10);

const addDays = (date, amount) => {
    const next = new Date(date);
    next.setUTCDate(next.getUTCDate() + amount);
    return next;
};

const isWeekend = (date) => {
    const day = date.getUTCDay();
    return day === 0 || day === 6;
};

const getStartOfMonth = (date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));

const getMonthIndex = (date) => date.getUTCFullYear() * 12 + date.getUTCMonth();

const calculateBusinessDays = (startDate, endDate, holidayKeys) => {
    if (!startDate || !endDate) {
        return 0;
    }

    let count = 0;
    for (let cursor = new Date(startDate); cursor <= endDate; cursor = addDays(cursor, 1)) {
        if (isWeekend(cursor)) {
            continue;
        }
        const key = toDateKey(cursor);
        if (holidayKeys && holidayKeys.has(key)) {
            continue;
        }
        count += 1;
    }

    return count;
};

module.exports = {
    toDateOnly,
    toDateKey,
    addDays,
    isWeekend,
    getStartOfMonth,
    getMonthIndex,
    calculateBusinessDays
};
