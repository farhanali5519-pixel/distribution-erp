import fs from 'node:fs';

fs.rmSync('.next', { recursive: true, force: true });
console.log('[clean-next-build] Cleaned .next build directory');
