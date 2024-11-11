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

// ------------------- Convert real-world date to Hyrulean calendar date -------------------
function convertToHyruleanDate(date) {
    const hyruleanMonth = getHyruleanMonth(date);
    if (hyruleanMonth) {
        const dayInMonth = moment(date).diff(moment(hyruleanMonth.start, 'MM-DD'), 'days') + 1;
        console.log(`Converted real-world date to Hyrulean: ${hyruleanMonth.name} ${dayInMonth}`);
        return `${hyruleanMonth.name} ${dayInMonth}`;
    }
    console.error('Invalid date for Hyrulean conversion.');
    return 'Invalid date';
}

// ------------------- Convert Hyrulean Date to Blood Moon Cycle Day -------------------
function getBloodMoonCycleDay(hyruleanDate) {
    console.log(`Hyrulean Date received: "${hyruleanDate}"`); // Log the received Hyrulean date

    // Use a regular expression to extract the day number from the Hyrulean date string
    const dayMatch = hyruleanDate.match(/\d+/); // Find the first number in the string

    if (!dayMatch) {
        console.error(`Failed to extract day from Hyrulean date: "${hyruleanDate}"`);
        return NaN; // Handle the case where no number is found
    }

    const dayInMonth = parseInt(dayMatch[0], 10); // Convert the extracted day to an integer

    // Return the day in the Blood Moon cycle (1 to 26)
    // No need to add 1; the modulo ensures the day stays within 1-26
    return (dayInMonth % 26 === 0) ? 26 : (dayInMonth % 26); // Keep it in range 1 to 26
}

// ------------------- Export the functions -------------------
module.exports = {
    getHyruleanMonth,
    isBloodmoon,
    convertToHyruleanDate,
    getBloodMoonCycleDay 
};
