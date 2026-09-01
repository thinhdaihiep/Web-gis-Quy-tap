const fs = require('fs');
const glob = require('glob');

function fixFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;
  
  // Replace: typeof X === 'number'
  // Only if not followed by && !isNaN(X)
  const regex = /typeof\s+([a-zA-Z0-9_\[\]\.]+)\s*===\s*['"]number['"](?!\s*&&\s*!isNaN)/g;
  
  content = content.replace(regex, (match, p1) => {
    changed = true;
    return `typeof ${p1} === 'number' && !isNaN(${p1})`;
  });

  if (changed) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Fixed ${filePath}`);
  }
}

glob.sync('src/**/*.ts*').forEach(fixFile);
