import fs from 'node:fs';
const main = fs.readFileSync('src/main.js','utf8');
const index = fs.readFileSync('index.html','utf8');
const checks = [
  ['npm PlayCanvas import', main.includes("from 'playcanvas'")],
  ['bundled Ammo import', main.includes("sync-ammo/dist/ammo.module.js")],
  ['no runtime PlayCanvas CDN', !main.includes('cdn.jsdelivr.net/npm/playcanvas')],
  ['player capsule', /type:\s*'capsule'/.test(main)],
  ['physics raycast', main.includes('raycastFirst')],
  ['magnet force', main.includes('applyForce')],
  ['weld joint', main.includes("type: 'fixed'") || main.includes("type:'fixed'")],
  ['hinge door', main.includes("type: 'hinge'") || main.includes("type:'hinge'")],
  ['NPC system', main.includes('spawnNpc')],
  ['third person', main.includes('thirdPerson')],
  ['menus', index.includes('spawnMenu') && index.includes('characterMenu')],
  ['test hook', main.includes('__RIGYARD_TEST__')]
];
let failed = 0;
for (const [name,ok] of checks) { console.log(ok?'PASS':'FAIL',name); if(!ok) failed++; }
if (failed) process.exit(1);
console.log(`\n${checks.length}/${checks.length} static checks passed`);
