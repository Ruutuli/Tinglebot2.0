const fs = require('fs');
const { handleError } = require('../utils/globalErrorHandler');
const path = require('path');

// Set your project directory path here.
const projectDirectory = "C:\\Users\\Ruu\\Desktop\\Tinglebot 2.0";

/**
 * Recursively prints a tree-like directory listing.
 * Each level is prefixed with lines constructed using pipes and dashes.
 * It ignores directories "node_modules", "website", and ".git".
 *
 * @param {string} currentPath - The directory to list.
 * @param {string} prefix - The string to prepend for the current indentation level.
 */
function printTree(currentPath, prefix) {
  let items;
  try {
    items = fs.readdirSync(currentPath, { withFileTypes: true });
  } catch (err) {
    handleError(err, 'directory.js');

    console.error(`Error reading directory ${currentPath}: ${err.message}`);
    return;
  }

  // Filter out ignored directories: "node_modules", "website", and ".git"
  items = items.filter(item => {
    return !(item.name === 'node_modules' || item.name === 'website' || item.name === '.git');
  });

  // Sort items alphabetically so the tree appears neat.
  items.sort((a, b) => a.name.localeCompare(b.name));

  // Loop through items and print each with tree-lines.
  items.forEach((item, index) => {
    const isLast = index === items.length - 1;
    const pointer = "|-";

    // Print the current item with its prefix and pointer.
    console.log(prefix + pointer + item.name);

    // If the item is a directory, recurse into it.
    if (item.isDirectory()) {
      // Build the new prefix: add vertical line if there are more siblings.
      const newPrefix = prefix + (isLast ? "       " : "|      ");
      printTree(path.join(currentPath, item.name), newPrefix);
    }
  });
}

// Print the root directory.
console.log(projectDirectory);

// Start printing the tree from the project directory with an empty prefix.
printTree(projectDirectory, "");
