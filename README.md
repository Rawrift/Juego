# RIGYARD

Industrial physics sandbox rebuilt on PlayCanvas 2.22.2 + Bullet/Ammo.

## Development

```bash
npm install
npm run dev
```

## Verified build

```bash
npm test
npm run build
npm run test:e2e
```

The production build has no runtime dependency on a PlayCanvas CDN. PlayCanvas and Ammo are bundled by Vite. Required GLB assets are downloaded at build time into `public/models` and copied into `dist/models`.

## Controls

- WASD: move
- Shift: sprint
- Ctrl: crouch
- Space: jump
- Mouse: look
- C: first/third person
- Q: spawn menu
- P: character menu
- 1: magnet
- 2: weld kit
- 3: impulse weapon
- 4: hands
- X: remove last weld
- F3: graphics preset

Use `ABRIR_RIGYARD.bat` from a packaged build on Windows instead of opening index.html directly.


Verification trigger: 2026-09-18 — browser gate enabled.
