#!/usr/bin/env node
// Generates icon16.png, icon32.png, icon48.png, icon128.png from icon.svg
//
// One-time setup:
//   npm install sharp
//
// Then run:
//   node icons/make-icons.js

const path = require('path');
const fs   = require('fs');

let sharp;
try {
  sharp = require('sharp');
} catch (_) {
  console.error('sharp not found. Run:  npm install sharp');
  process.exit(1);
}

const svgPath = path.join(__dirname, 'icon.svg');
const svg     = fs.readFileSync(svgPath);
const sizes   = [16, 32, 48, 128];

async function main() {
  for (const size of sizes) {
    const out = path.join(__dirname, `icon${size}.png`);
    await sharp(svg).resize(size, size).png().toFile(out);
    console.log(`  icon${size}.png`);
  }
  console.log('Done.');
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
