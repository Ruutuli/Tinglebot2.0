// ------------------- Import necessary modules -------------------
const moment = require('moment');

// ------------------- Calendar months and date ranges -------------------
const hyruleanCalendar = [
    { monthId: 1, name: 'Yowaka Ita', start: '01-01', end: '01-26' },
    { monthId: 2, name: 'Noe Rajee', start: '01-27', end: '02-21' },
    { monthId: 3, name: 'Ha Dahamar', start: '02-22', end: '03-19' },
    { monthId: 4, name: 'Shae Katha', start: '03-20', end: '04-14' },
    { monthId: 5, name: 'Keo Ruug', start: '04-15', end: '05-10' },
    { monthId: 6, name: 'Gee Ha\'rah', start: '05-11', end: '06-04' },
    { monthId: 7, name: 'Jitan Sa\'mi', start: '06-05', end: '07-01' },
    { monthId: 8, name: 'Sha Warvo', start: '07-02', end: '07-27' },
    { monthId: 9, name: 'Tutsuwa Nima', start: '07-28', end: '08-22' },
    { monthId: 10, name: 'Shae Mo\'sah', start: '08-23', end: '09-17' },
    { monthId: 11, name: 'Hawa Koth', start: '09-18', end: '10-13' },
    { monthId: 12, name: 'Maka Rah', start: '10-14', end: '11-08' },
    { monthId: 13, name: 'Ya Naga', start: '11-09', end: '12-04' },
    { monthId: 14, name: 'Etsu Korima', start: '12-05', end: '12-31' }
];

// ------------------- Bloodmoon dates -------------------
const bloodmoonDates = [
    { realDate: '01-13', month: 'Yowaka Ita', day: 13 },
    { realDate: '02-08', month: 'Noe Rajee', day: 13 },
    { realDate: '03-06', month: 'Ha Dahamar', day: 13 },
    { realDate: '04-01', month: 'Shae Katha', day: 13 },
    { realDate: '04-27', month: 'Keo Ruug', day: 13 }, 
    { realDate: '05-23', month: 'Gee Ha\'rah', day: 13 },
    { realDate: '06-18', month: 'Jitan Sa\'mi', day: 13 },
    { realDate: '07-14', month: 'Sha Warvo', day: 13 },
    { realDate: '08-09', month: 'Tutsuwa Nima', day: 13 },
    { realDate: '09-04', month: 'Shae Mo\'sah', day: 13 },
    { realDate: '09-30', month: 'Hawa Koth', day: 13 },
    { realDate: '10-26', month: 'Maka Rah', day: 13 },
    { realDate: '11-21', month: 'Ya Naga', day: 13 },
    { realDate: '12-17', month: 'Etsu Korima', day: 13 }
];

// ------------------- Get current Hyrulean month based on date -------------------
function getHyruleanMonth(date) {
    const formattedDate = moment(date).format('MM-DD');
    return hyruleanCalendar.find(month => {
        const start = moment(month.start, 'MM-DD');
        const end = moment(month.end, 'MM-DD');
        return moment(formattedDate, 'MM-DD').isBetween(start, end, null, '[]');
    });
}

// ------------------- Check if it's Bloodmoon -------------------
function isBloodmoon(date) {
    const formattedDate = moment(date).format('MM-DD');
    return bloodmoonDates.some(bloodmoon => bloodmoon.realDate === formattedDate);
}

// ------------------- Get most recent past Blood Moon date -------------------
// Returns the real-world date of the last Blood Moon that has passed, or null if none
function getMostRecentPastBloodMoonDate() {
    const now = moment();
    for (let i = bloodmoonDates.length - 1; i >= 0; i--) {
        const { realDate } = bloodmoonDates[i];
        const [month, day] = realDate.split('-').map(Number);
        const bloodMoonDate = moment().year(now.year()).month(month - 1).date(day);
        if (bloodMoonDate.isSameOrBefore(now)) {
            return bloodMoonDate.toDate();
        }
    }
    // No blood moon this year yet - use last year's final blood moon
    const lastYear = moment().year(now.year() - 1);
    const lastEntry = bloodmoonDates[bloodmoonDates.length - 1];
    const [month, day] = lastEntry.realDate.split('-').map(Number);
    return lastYear.month(month - 1).date(day).toDate();
}

// ------------------- Convert real-world date to Hyrulean calendar date -------------------
function convertToHyruleanDate(date) {
    const hyruleanMonth = getHyruleanMonth(date);
    if (hyruleanMonth) {
        const dayInMonth = moment(date).diff(moment(hyruleanMonth.start, 'MM-DD'), 'days') + 1;
        return `${hyruleanMonth.name} ${dayInMonth}`;
    }
    console.error('Invalid date for Hyrulean conversion.');
    return 'Invalid date';
}

const BLOOD_MOON_CYCLE = 26;

// ------------------- Convert Hyrulean Date to Blood Moon Cycle Day -------------------
function getBloodMoonCycleDay(hyruleanDate) {
    console.log(`Hyrulean Date received: "${hyruleanDate}"`); // Log the received Hyrulean date

    // Split the Hyrulean date into month name and day
    const [monthName, dayString] = hyruleanDate.split(' ');
    const dayInMonth = parseInt(dayString, 10);

    if (isNaN(dayInMonth)) {
        console.error(`Failed to extract day from Hyrulean date: "${hyruleanDate}"`);
        return NaN; // Handle invalid day input
    }

    // Find the matching Blood Moon date in the predefined dates
    const bloodmoonDate = bloodmoonDates.find(
        (entry) => entry.month === monthName && entry.day === dayInMonth
    );

    if (!bloodmoonDate) {
        console.error(`No matching Blood Moon date found for: "${hyruleanDate}"`);
        return NaN; // Handle case where the date is not in the Blood Moon cycle
    }

    // Determine the position of the matched date in the cycle
    const cycleIndex = bloodmoonDates.findIndex(
        (entry) => entry.realDate === bloodmoonDate.realDate
    );

    // Calculate the Blood Moon cycle day
    const cycleDay = (cycleIndex % BLOOD_MOON_CYCLE) + 1;

    console.log(`Calculated Blood Moon Cycle Day: ${cycleDay}`);
    return cycleDay;
}

// ------------------- Export the functions -------------------
module.exports = {
    hyruleanCalendar,
    bloodmoonDates,
    getHyruleanMonth,
    isBloodmoon,
    convertToHyruleanDate,
    getBloodMoonCycleDay,
    getMostRecentPastBloodMoonDate,
};
