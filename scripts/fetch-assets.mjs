import fs from 'node:fs/promises';
import path from 'node:path';

const out = path.resolve('public/models');
await fs.mkdir(out, { recursive: true });

const sources = [
  ['field-explorer.glb','https://raw.githubusercontent.com/RRG314/WorldExplorer3D/b5a6a32448fcaa7c5e079ccb78d9d6030de29a00/app/assets/models/characters/field-explorer-v1.glb'],
  ['field-explorer-woman.glb','https://raw.githubusercontent.com/RRG314/WorldExplorer3D/b5a6a32448fcaa7c5e079ccb78d9d6030de29a00/app/assets/models/characters/field-explorer-woman-v1.glb'],
  ['city-explorer.glb','https://raw.githubusercontent.com/RRG314/WorldExplorer3D/b5a6a32448fcaa7c5e079ccb78d9d6030de29a00/app/assets/models/characters/city-explorer-v1.glb'],
  ['city-worker-woman.glb','https://raw.githubusercontent.com/RRG314/WorldExplorer3D/b5a6a32448fcaa7c5e079ccb78d9d6030de29a00/app/assets/models/characters/city-explorer-woman-worker-v1.glb'],
  ['civic-responder.glb','https://raw.githubusercontent.com/RRG314/WorldExplorer3D/b5a6a32448fcaa7c5e079ccb78d9d6030de29a00/app/assets/models/characters/civic-responder-v1.glb'],
  ['ship-crew.glb','https://raw.githubusercontent.com/RRG314/WorldExplorer3D/b5a6a32448fcaa7c5e079ccb78d9d6030de29a00/app/assets/models/characters/ship-crew-v1.glb'],
  ['pulse-sidearm.glb','https://raw.githubusercontent.com/RRG314/WorldExplorer3D/b5a6a32448fcaa7c5e079ccb78d9d6030de29a00/app/assets/models/equipment/explorer-pulse-sidearm-v1.glb'],
  ['laser-rifle.glb','https://raw.githubusercontent.com/RRG314/WorldExplorer3D/b5a6a32448fcaa7c5e079ccb78d9d6030de29a00/app/assets/models/equipment/explorer-laser-rifle-v1.glb'],
  ['hand-left.glb','https://raw.githubusercontent.com/immersive-web/webxr-input-profiles/f4992299601614adbfefd398dc8e281556bb7444/packages/assets/profiles/generic-hand/left.glb'],
  ['hand-right.glb','https://raw.githubusercontent.com/immersive-web/webxr-input-profiles/f4992299601614adbfefd398dc8e281556bb7444/packages/assets/profiles/generic-hand/right.glb'],
  ['grass.glb','https://raw.githubusercontent.com/RRG314/WorldExplorer3D/b5a6a32448fcaa7c5e079ccb78d9d6030de29a00/app/assets/models/nature/grass.glb'],
  ['shrub.glb','https://raw.githubusercontent.com/RRG314/WorldExplorer3D/b5a6a32448fcaa7c5e079ccb78d9d6030de29a00/app/assets/models/nature/shrub.glb'],
  ['fern.glb','https://raw.githubusercontent.com/RRG314/WorldExplorer3D/b5a6a32448fcaa7c5e079ccb78d9d6030de29a00/app/assets/models/nature/fern.glb'],
  ['utility-pickup.glb','https://raw.githubusercontent.com/RRG314/WorldExplorer3D/b5a6a32448fcaa7c5e079ccb78d9d6030de29a00/app/assets/models/vehicles/traffic/utility-pickup-v1.glb'],
  ['service-truck.glb','https://raw.githubusercontent.com/RRG314/WorldExplorer3D/b5a6a32448fcaa7c5e079ccb78d9d6030de29a00/app/assets/models/vehicles/traffic/service-truck-v1.glb']
];

for (const [name,url] of sources) {
  const dest = path.join(out,name);
  let ok = false;
  try {
    const b = await fs.readFile(dest);
    ok = b.length > 1000 && b.subarray(0,4).toString('ascii') === 'glTF';
  } catch {}
  if (ok) continue;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`asset ${name}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 1000 || buf.subarray(0,4).toString('ascii') !== 'glTF') throw new Error(`asset ${name}: invalid GLB`);
  await fs.writeFile(dest,buf);
  console.log('asset',name,buf.length);
}
