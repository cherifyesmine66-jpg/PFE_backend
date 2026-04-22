const { runMonthlyAccrual } = require('./accrual');

// Tracks the year-month key for the last successful accrual run so it runs at most once per month.
let lastAccrualKey = null;

function startScheduler() {
    const INTERVAL_MS = 60 * 60 * 1000; // check every hour

    const check = async () => {
        const now = new Date();
        // Only trigger on the 1st calendar day of the month
        if (now.getUTCDate() !== 1) {
            return;
        }

        const key = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
        if (lastAccrualKey === key) {
            return;
        }

        console.log(`[Scheduler] Monthly accrual triggered for ${key}`);
        try {
            lastAccrualKey = key;
            await runMonthlyAccrual();
        } catch (error) {
            // Allow retry on next hour check
            lastAccrualKey = null;
            console.error('[Scheduler] Accrual failed:', error.message);
        }
    };

    setInterval(check, INTERVAL_MS);
    console.log('[Scheduler] Monthly accrual scheduler started (hourly checks).');
}

module.exports = { startScheduler };
