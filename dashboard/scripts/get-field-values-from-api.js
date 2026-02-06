// ============================================================================
// Get field values from the API endpoint
// Run with: node dashboard/scripts/get-field-values-from-api.js
// ============================================================================

const https = require("https");
const http = require("http");

// Get port from command line argument or environment variable, default to 6001
const port = process.argv[2] || process.env.PORT || process.env.API_PORT || "6001";
const API_URL = process.env.API_URL || `http://localhost:${port}/api/models/items?limit=1000`;

function fetchData(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https") ? https : http;
    
    client.get(url, (res) => {
      let data = "";
      
      res.on("data", (chunk) => {
        data += chunk;
      });
      
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse JSON: ${e.message}`));
        }
      });
    }).on("error", (err) => {
      reject(err);
    });
  });
}

async function getFieldValues() {
  try {
    console.log(`📡 Fetching from: ${API_URL}\n`);
    const response = await fetchData(API_URL);
    
    if (!response.filterOptions) {
      console.error("❌ No filterOptions in response");
      console.log("Response keys:", Object.keys(response));
      process.exit(1);
    }
    
    const { category, type, categoryGear, subtype } = response.filterOptions;
    
    console.log("=".repeat(80));
    console.log("FIELD VALUES FROM API");
    console.log("=".repeat(80));
    console.log("\n📋 CATEGORY VALUES:");
    console.log(JSON.stringify(category, null, 2));
    console.log("\n📋 TYPE VALUES:");
    console.log(JSON.stringify(type, null, 2));
    console.log("\n📋 CATEGORY GEAR VALUES:");
    console.log(JSON.stringify(categoryGear, null, 2));
    console.log("\n📋 SUBTYPE VALUES:");
    console.log(JSON.stringify(subtype, null, 2));

    console.log("\n" + "=".repeat(80));
    console.log("CODE TO COPY:");
    console.log("=".repeat(80));
    console.log("\nexport const FIELD_OPTIONS = {");
    console.log(`  category: ${JSON.stringify(category, null, 2)},`);
    console.log(`  type: ${JSON.stringify(type, null, 2)},`);
    console.log(`  categoryGear: ${JSON.stringify(categoryGear, null, 2)},`);
    console.log(`  subtype: ${JSON.stringify(subtype, null, 2)},`);
    console.log("};");

    console.log("\n✅ Extraction complete!");
    console.log(`   Found ${category?.length || 0} categories`);
    console.log(`   Found ${type?.length || 0} types`);
    console.log(`   Found ${categoryGear?.length || 0} category gears`);
    console.log(`   Found ${subtype?.length || 0} subtypes`);
  } catch (error) {
    console.error("❌ Error:", error.message);
    console.error("\n💡 Make sure your dev server is running on port 3000");
    console.error("   Or set API_URL environment variable to your API endpoint");
    process.exit(1);
  }
}

getFieldValues();
