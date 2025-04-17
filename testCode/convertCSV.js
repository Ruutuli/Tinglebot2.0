// convertCSV.js
// Usage:
//   node convertCSV.js "C:\Users\Ruu\Desktop\Tinglebot 2.0\.weather\[RotW] Weather Conditions [2023] - Rudania.csv" "C:\Users\Ruu\Desktop\Tinglebot 2.0\.weather\[RotW] Weather Conditions [2023] - Inariko.csv" "C:\Users\Ruu\Desktop\Tinglebot 2.0\.weather\[RotW] Weather Conditions [2023] - Vhintl.csv"
//
// This script processes multiple CSV files, each with two header rows and then groups of four columns
// (Temperature, Wind, Precipitation, Special) for each season (assumed Winter, Spring, Summer, Autumn).
// It writes a JavaScript module for each village with the parsed weather data.

const fs = require("fs");
const path = require("path");
const Papa = require("papaparse");

// Get CSV file paths from command-line arguments
const csvFiles = process.argv.slice(2);
if (csvFiles.length === 0) {
  console.error("No CSV files provided. Usage: node convertCSV.js <csvFile1> <csvFile2> ...");
  process.exit(1);
}

// Define the seasons in the order they appear in the CSV columns
const seasonsOrder = ["Winter", "Spring", "Summer", "Autumn"];

csvFiles.forEach(csvFilePath => {
  console.log(`Processing: ${csvFilePath}`);
  
  // Read CSV file
  const csvData = fs.readFileSync(csvFilePath, "utf8");
  
  // Parse CSV with no header and skipping empty lines
  const parsed = Papa.parse(csvData, { header: false, skipEmptyLines: true });
  const rows = parsed.data;
  
  // Extract village name using a regex on the filename.
  // Expect filename to be like: "[RotW] Weather Conditions [2023] - Rudania.csv"
  const baseName = path.basename(csvFilePath, ".csv");
  let villageMatch = baseName.match(/-\s*(.+)$/);
  let village = villageMatch && villageMatch[1] ? villageMatch[1].trim() : baseName;
  
  // Initialize the output data structure.
  let outputData = {
    village: village,
    seasons: {
      Winter: { Temperature: [], Wind: [], Precipitation: [], Special: [] },
      Spring: { Temperature: [], Wind: [], Precipitation: [], Special: [] },
      Summer: { Temperature: [], Wind: [], Precipitation: [], Special: [] },
      Autumn: { Temperature: [], Wind: [], Precipitation: [], Special: [] }
    }
  };
  
  // The CSV has two header rows; start processing from row index 2.
  for (let i = 2; i < rows.length; i++) {
    const row = rows[i];
    // For each season, the group of 4 columns starts at:
    // index 0 for Winter, 4 for Spring, 8 for Summer, 12 for Autumn.
    seasonsOrder.forEach((season, index) => {
      const baseIndex = index * 4;
      const temperature = row[baseIndex] ? row[baseIndex].trim() : "";
      const wind = row[baseIndex + 1] ? row[baseIndex + 1].trim() : "";
      const precipitation = row[baseIndex + 2] ? row[baseIndex + 2].trim() : "";
      const special = row[baseIndex + 3] ? row[baseIndex + 3].trim() : "";
  
      // Filter out header values if encountered
      if (temperature && temperature !== "Temperature") {
        outputData.seasons[season].Temperature.push(temperature);
      }
      if (wind && wind !== "Wind") {
        outputData.seasons[season].Wind.push(wind);
      }
      if (precipitation && precipitation !== "Precipitation") {
        outputData.seasons[season].Precipitation.push(precipitation);
      }
      if (special && special !== "Special") {
        outputData.seasons[season].Special.push(special);
      }
    });
  }
  
  // Remove duplicates from each array (if needed)
  seasonsOrder.forEach(season => {
    let s = outputData.seasons[season];
    s.Temperature = Array.from(new Set(s.Temperature));
    s.Wind = Array.from(new Set(s.Wind));
    s.Precipitation = Array.from(new Set(s.Precipitation));
    s.Special = Array.from(new Set(s.Special));
  });
  
  // Write out the JavaScript module: e.g., "rudaniaSeasons.js"
  const outputFileName = `${village.toLowerCase()}Seasons.js`;
  const fileContents = `module.exports = ${JSON.stringify(outputData, null, 2)};\n`;
  fs.writeFileSync(outputFileName, fileContents, "utf8");
  console.log(`Created ${outputFileName}`);
});
