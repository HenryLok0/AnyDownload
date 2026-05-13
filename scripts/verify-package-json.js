const fs = require('fs');
const path = require('path');

const packageJsonPath = path.join(__dirname, '..', 'package.json');
const bytes = fs.readFileSync(packageJsonPath);

if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
  throw new Error('package.json contains UTF-8 BOM. Save as UTF-8 (without BOM) before publishing.');
}

const text = bytes.toString('utf8');
JSON.parse(text);

console.log('package.json encoding and JSON format look valid.');
