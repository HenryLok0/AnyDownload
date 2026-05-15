const fs = require('fs');
const path = require('path');

const packageJsonPath = path.join(__dirname, '..', 'package.json');
const bytes = fs.readFileSync(packageJsonPath);

if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    throw new Error('package.json contains UTF-8 BOM. Save as UTF-8 (without BOM) before publishing.');
}

const pkg = JSON.parse(bytes.toString('utf8'));

if (!pkg.bin?.anydownload) {
    throw new Error('package.json must define bin.anydownload pointing to bin/cli.js');
}

const binPath = path.join(__dirname, '..', pkg.bin.anydownload);
if (!fs.existsSync(binPath)) {
    throw new Error(`bin entry points to missing file: ${pkg.bin.anydownload}`);
}

const binContent = fs.readFileSync(binPath, 'utf8');
if (!binContent.startsWith('#!')) {
    throw new Error(`${pkg.bin.anydownload} must start with a shebang (#!/usr/bin/env node)`);
}

console.log('package.json encoding, JSON format, and bin entry look valid.');
