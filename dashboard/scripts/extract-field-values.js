// ============================================================================
// Extract unique values for category, type, categoryGear, and subtype
// Run with: node dashboard/scripts/extract-field-values.js
// ============================================================================

const mongoose = require("mongoose");
const path = require("path");

// Load environment variables
try {
  require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
} catch (e) {
  // Ignore if dotenv not available
}

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

if (!MONGODB_URI) {
  console.error("❌ MONGODB_URI not found in environment variables");
  console.error("   Make sure MONGODB_URI is set in dashboard/.env");
  process.exit(1);
}

async function extractFieldValues() {
  try {
    console.log("🔌 Connecting to database...");
    console.log(`   URI: ${MONGODB_URI.replace(/\/\/.*@/, "//***:***@")}`);
    
    await mongoose.connect(MONGODB_URI);
    
    console.log("✅ Connected to database\n");

    // Define minimal schema for querying (same approach as other scripts)
    const ItemSchema = new mongoose.Schema({
      category: [String],
      type: [String],
      categoryGear: String,
      subtype: [String],
    }, { collection: 'items', strict: false });
    
    const Item = mongoose.models.Item || mongoose.model('Item', ItemSchema);

    console.log("📊 Fetching all items to extract unique values...\n");

    // Fetch all items and extract unique values from arrays
    const allItems = await Item.find({})
      .select("category type categoryGear subtype")
      .lean()
      .maxTimeMS(60000);

    console.log(`   Found ${allItems.length} items\n`);

    // Extract unique values from arrays
    const categories = new Set();
    const types = new Set();
    const categoryGears = new Set();
    const subtypes = new Set();

    allItems.forEach((item) => {
      if (item.category && Array.isArray(item.category)) {
        item.category.forEach((cat) => {
          if (cat) categories.add(cat);
        });
      }
      if (item.type && Array.isArray(item.type)) {
        item.type.forEach((t) => {
          if (t) types.add(t);
        });
      }
      if (item.categoryGear && typeof item.categoryGear === "string") {
        categoryGears.add(item.categoryGear);
      }
      if (item.subtype && Array.isArray(item.subtype)) {
        item.subtype.forEach((st) => {
          if (st) subtypes.add(st);
        });
      }
    });

    // Convert Sets to sorted arrays
    const categoryValues = Array.from(categories).sort((a, b) => String(a).localeCompare(String(b)));
    const typeValues = Array.from(types).sort((a, b) => String(a).localeCompare(String(b)));
    const categoryGearValues = Array.from(categoryGears).sort((a, b) => String(a).localeCompare(String(b)));
    const subtypeValues = Array.from(subtypes).sort((a, b) => String(a).localeCompare(String(b)));

    console.log("=".repeat(80));
    console.log("FIELD VALUES EXTRACTED FROM DATABASE");
    console.log("=".repeat(80));
    console.log("\n📋 CATEGORY VALUES:");
    console.log(JSON.stringify(categoryValues, null, 2));
    console.log("\n📋 TYPE VALUES:");
    console.log(JSON.stringify(typeValues, null, 2));
    console.log("\n📋 CATEGORY GEAR VALUES:");
    console.log(JSON.stringify(categoryGearValues, null, 2));
    console.log("\n📋 SUBTYPE VALUES:");
    console.log(JSON.stringify(subtypeValues, null, 2));

    console.log("\n" + "=".repeat(80));
    console.log("CODE TO COPY:");
    console.log("=".repeat(80));
    console.log("\nconst FIELD_OPTIONS = {");
    console.log(`  category: ${JSON.stringify(categoryValues, null, 2)},`);
    console.log(`  type: ${JSON.stringify(typeValues, null, 2)},`);
    console.log(`  categoryGear: ${JSON.stringify(categoryGearValues, null, 2)},`);
    console.log(`  subtype: ${JSON.stringify(subtypeValues, null, 2)},`);
    console.log("};");

    console.log("\n✅ Extraction complete!");
    console.log(`   Found ${categoryValues.length} categories`);
    console.log(`   Found ${typeValues.length} types`);
    console.log(`   Found ${categoryGearValues.length} category gears`);
    console.log(`   Found ${subtypeValues.length} subtypes`);

    await mongoose.disconnect();
    console.log("\n🔌 Disconnected from database");
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

extractFieldValues();
