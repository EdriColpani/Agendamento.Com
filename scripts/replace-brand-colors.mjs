import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.join(__dirname, '..', 'src');

const patterns = [
  ['bg-yellow-600 hover:bg-yellow-700 text-black', 'bg-primary text-primary-foreground hover:bg-primary/90'],
  ['bg-yellow-600 hover:bg-yellow-700', 'bg-primary hover:bg-primary/90'],
  ['text-yellow-600 hover:underline', 'text-primary hover:underline'],
  ['text-yellow-600', 'text-primary'],
  ['border-yellow-600', 'border-primary'],
  ['ring-yellow-600', 'ring-primary'],
  ['border-yellow-500', 'border-primary'],
  ['bg-yellow-50', 'bg-primary/10'],
  ['border-yellow-200', 'border-primary/20'],
  ['text-yellow-700', 'text-primary'],
  ['border-yellow-700', 'border-primary'],
  ['bg-yellow-100', 'bg-primary/10'],
  ['text-yellow-800', 'text-amber-900'],
];

function walk(dir, files = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) walk(full, files);
    else if (/\.(tsx|ts)$/.test(name)) files.push(full);
  }
  return files;
}

let changed = 0;
for (const file of walk(srcDir)) {
  let c = fs.readFileSync(file, 'utf8');
  const orig = c;
  for (const [oldS, newS] of patterns) {
    if (c.includes(oldS)) c = c.split(oldS).join(newS);
  }
  if (c !== orig) {
    fs.writeFileSync(file, c, 'utf8');
    changed++;
    console.log(file);
  }
}
console.log('Files updated:', changed);
