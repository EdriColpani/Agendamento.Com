import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.join(__dirname, '..', 'src');

const patterns = [
  ['bg-yellow-600 text-black', 'bg-primary text-primary-foreground'],
  ['bg-yellow-600', 'bg-primary'],
  ['focus:ring-yellow-500', 'focus:ring-primary'],
  ['file:bg-yellow-600', 'file:bg-primary'],
  ['hover:file:bg-yellow-700', 'hover:file:bg-primary/90'],
  ['dark:file:bg-yellow-700', 'dark:file:bg-primary/90'],
  ['bg-yellow-200', 'bg-amber-200'],
  ['text-yellow-900', 'text-amber-900'],
  ['group-hover:bg-yellow-200', 'group-hover:bg-primary/15'],
  ['from-yellow-50', 'from-primary/5'],
  ['bg-yellow-400', 'bg-primary/70'],
  ['text-yellow-500', 'text-amber-500'],
  ['dark:border-yellow-800', 'dark:border-amber-900'],
];

function walk(dir, files = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) walk(full, files);
    else if (/\.(tsx|ts)$/.test(name)) files.push(full);
  }
  return files;
}

for (const file of walk(srcDir)) {
  let c = fs.readFileSync(file, 'utf8');
  const orig = c;
  for (const [oldS, newS] of patterns) {
    if (c.includes(oldS)) c = c.split(oldS).join(newS);
  }
  if (c !== orig) fs.writeFileSync(file, c, 'utf8');
}
