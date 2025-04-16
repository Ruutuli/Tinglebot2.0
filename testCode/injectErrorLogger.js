const fs = require('fs');
const path = require('path');

const targetDir = './'; // Start scanning here

function getAllJSFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir);

  list.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat && stat.isDirectory() && !filePath.includes('node_modules')) {
      results = results.concat(getAllJSFiles(filePath));
    } else if (file.endsWith('.js')) {
      results.push(filePath);
    }
  });

  return results;
}

function getImportPath(filePath) {
  const depth = Math.max(0, filePath.split(path.sep).length - 2);
  return '../'.repeat(depth) + 'utils/globalErrorHandler';
}


function processFile(filePath) {
  let contents = fs.readFileSync(filePath, 'utf8');
  const fileName = path.basename(filePath);
  const importPath = getImportPath(filePath);

  const importLine = `const { handleError } = require('${importPath}');`;

  if (!contents.includes('handleError')) {
    const requireMatch = contents.match(/^(const .*require\(.*\);[\r\n]+)/m);
    if (requireMatch) {
      contents = contents.replace(requireMatch[0], requireMatch[0] + importLine + '\n');
    } else {
      contents = importLine + '\n\n' + contents;
    }
  }

  contents = contents.replace(/catch\s*\(\s*(\w+)\s*\)\s*\{([\s\S]*?)\}/g, (match, errVar, body) => {
    if (body.includes('handleError')) return match;

    let newBody = body;

    if (body.includes(`console.error(${errVar}`)) {
      newBody = newBody.replace(
        new RegExp(`console\\.error\\(${errVar}.*?\\);?`, 'g'),
        `handleError(${errVar}, '${fileName}', { commandName: '${fileName.replace('.js', '')}', userTag: interaction.user?.tag, userId: interaction.user?.id, options: interaction.options?.data });`
      );
    } else {
      newBody = `\n    handleError(${errVar}, '${fileName}', { commandName: '${fileName.replace('.js', '')}', userTag: interaction.user?.tag, userId: interaction.user?.id, options: interaction.options?.data });\n` + newBody;
    }

    return `catch (${errVar}) {${newBody}}`;
  });

  fs.writeFileSync(filePath, contents, 'utf8');
  console.log(`[injectErrorLogger]: Updated ${filePath}`);
}

const jsFiles = getAllJSFiles(targetDir);
jsFiles.forEach(processFile);

console.log(`✅ Injection complete. All JS files are updated with advanced error logging!`);
