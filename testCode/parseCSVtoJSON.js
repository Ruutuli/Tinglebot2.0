// =================== STANDARD LIBRARIES ===================
const fs = require('fs');
const path = require('path');

// =================== THIRD-PARTY LIBRARIES ===================
const csv = require('csv-parser');

// ------------------- Define Input/Output Paths -------------------
const inputCSV = path.join(__dirname, '[ROTW] Exploring [2023] - _tableroll relics ALL.csv');
const outputJSON = path.join(__dirname, 'parsedRelics.json');

// ------------------- Utility: Strip markdown and clean text -------------------
const stripMarkdown = (text) => {
  return text
    .replace(/\*\*__?/g, '')        // remove ** and __
    .replace(/__?\*\*/g, '')        // remove ** and __ in other order
    .replace(/\*{1,2}/g, '')        // remove * and **
    .replace(/```/g, '')            // remove codeblocks
    .replace(/\r?\n|\r/g, ' ')      // convert newlines to space
    .replace(/\s\s+/g, ' ')         // collapse multiple spaces
    .trim();
};

// ------------------- Utility: Extract field from text blob -------------------
const extractField = (text, field) => {
  const regex = new RegExp(`\\*\\*${field}:\\*\\*\\s*(.*?)\\s*(?=\\*\\*|$)`, 'i');
  const match = text.match(regex);
  return match ? stripMarkdown(match[1]) : '';
};

const extractName = (text) => {
  const nameMatch = text.match(/\*\*__([A-Z][^_]{2,})__\*\*/);
  return nameMatch ? stripMarkdown(nameMatch[1]) : '';
};

// ------------------- Parse CSV and Export JSON -------------------
const relics = [];

fs.createReadStream(inputCSV)
  .pipe(csv())
  .on('data', (row) => {
    const rawText = row['Text'] || '';
    const fallbackDescription = row[Object.keys(row)[2]] || ''; // usually 3rd column in spreadsheet

    const parsed = {
      roll: row['Roll'] || '',
      name: extractName(rawText),
      description: '',
      functionality: extractField(rawText, 'Functionality'),
      origins: extractField(rawText, 'Origins'),
      uses: extractField(rawText, 'Uses'),
    };

    const primaryDescription = extractField(rawText, 'Description');
    parsed.description = primaryDescription || stripMarkdown(fallbackDescription);

    relics.push(parsed);
  })
  .on('end', () => {
    fs.writeFileSync(outputJSON, JSON.stringify(relics, null, 2));
    console.log(`✅ CSV parsed and saved to ${outputJSON}`);
  })
  .on('error', (err) => {
    console.error('❌ Error parsing CSV:', err);
  });
