const fs = require('fs');
const path = require('path');

const logFile = path.join(__dirname, 'autocomplete_logs.txt');

function logToFile(message) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}\n`;

    fs.appendFile(logFile, logMessage, (err) => {
        if (err) {
            console.error('Failed to write to log file:', err);
        }
    });
}

module.exports = logToFile;
