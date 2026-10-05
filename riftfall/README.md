# RIFTFALL

**Juego web de supervivencia arcade con economía on-chain.** Esquiva hordas de enemigos de neón, elige mejoras
en cada subida de nivel, derrota a los Guardianes del Rift y gana **Shards**, que se canjean por el token **$RIFT**.
Las naves son **NFT** que se compran, se forjan y se revenden. En la **Arena** se compite por botes en RIFT.

![Menú](docs/img/menu.jpg)

| Partida | Jefe | Móvil |
|---|---|---|
| ![Partida](docs/img/gameplay.jpg) | ![Jefe](docs/img/boss.jpg) | ![Móvil](docs/img/mobile.jpg) |

- **Jugable en cualquier navegador** (escritorio y móvil con joystick táctil). No requiere instalar nada; la wallet solo se pide para cobrar.
- **Adictivo por diseño:** partidas de 3 a 10 minutos, 6 armas y 11 mejoras combinables, 3 jefes, misiones diarias, racha de días, ranking y torneos.
- **Economía con anti-trampas real ("Proof of Play"):** el servidor re-simula cada partida tick a tick antes de pagar.
- **Ingresos para el creador:** venta de naves, comisiones de Forja, Mercado y Arena, regalías y liquidez. Detalle en [`docs/ECONOMIA.md`](docs/ECONOMIA.md).

## Inicio rápido (todo en local, con blockchain)

Requisitos: Node.js 22.9 o superior.

```bash
cd riftfall
npm install
npm run build
npm run local          # nodo Hardhat + despliegue de contratos + servidor en http://localhost:8787
```

Para usar una wallet en local, importa en MetaMask la clave **de prueba** de la cuenta #3 de Hardhat, que ya tiene 250.000 RIFT
y 10.000 ETH de prueba (moneda de la red local): `0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6`.
El juego te propone añadir la red "RIFTFALL Local" (chainId 31337). Esa clave es pública: no la uses nunca fuera de local.

**Solo el juego, sin blockchain** (modo invitado, sin canjes): `npm run build && npm run server`.
Para desarrollo con recarga en caliente usa `npm run server` en una terminal y `npm run dev` en otra (http://localhost:5173).

## Cómo está construido

```
riftfall/
├── contracts/            Solidity (OpenZeppelin 5)
│   ├── RiftToken.sol       $RIFT: ERC-20 de suministro fijo (nombre/símbolo a elección), sin mint ni impuestos
│   ├── RewardVault.sol     pool de recompensas: vales EIP-712, halving cada 180 días, topes diarios, timelock
│   ├── RiftShips.sol       naves ERC-721 con clase y nivel, Forja, SVG on-chain, regalías ERC-2981
│   ├── RiftMarket.sol      mercado P2P sin custodia pagado en RIFT (comisión ≤ 10%)
│   ├── RiftArena.sol       torneos: inscripción, rake ≤ 15%, quema, reparto del bote, reembolsos
│   └── TeamVesting.sol     vesting del equipo (cliff + lineal)
├── src/sim/              simulación DETERMINISTA compartida por navegador y servidor
├── src/client/           render Canvas2D con brillos y partículas, audio sintetizado, UI, wallet (ethers v6)
├── src/launcher/        Lanzador móvil: crea token y contratos desde la wallet del creador
├── src/shared/abis.js    ABIs usados por cliente y servidor
├── src/generated/       bytecode de los contratos para el Lanzador (npm run export:contracts)
├── server/               API Node (sin frameworks): sesiones, replay en workers, vales, misiones, ranking, Arena
├── scripts/              despliegue, stack local, equilibrado con bot y simulador económico
├── test/                 contratos, simulación, servidor, integración on-chain y E2E en navegador
└── docs/                 ECONOMIA.md (diseño) y PROYECCION.md (modelo a 24 meses)
```

### Proof of Play (anti-trampas)

1. `POST /api/run/start` entrega una semilla aleatoria y fija la nave, cuya propiedad se verifica on-chain.
2. El navegador juega a 60 ticks/s fijos y graba solo las direcciones y elecciones (comprimidas con RLE).
3. `POST /api/run/finish` re-simula la partida completa en un worker y calcula él mismo las recompensas.
   También exige que la partida haya durado en tiempo real lo que dice la simulación.
4. Los Shards se canjean por $RIFT con un vale EIP-712 que el contrato `RewardVault` valida y limita.

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run local` | Stack local completo (blockchain + contratos + servidor + Arena automática) |
| `npm run server` / `npm start` | Solo el servidor (lee `.env`) |
| `npm run dev` | Cliente con recarga en caliente (proxy `/api` → 8787) |
| `npm run build` | Compila el cliente en `dist/` |
| `npm test` | Tests de simulación y servidor |
| `npm run test:contracts` | Tests de los contratos (26) |
| `npm run test:integration` | Flujo on-chain completo contra un nodo Hardhat |
| `npm run test:e2e` | Partida real en Chromium verificada por el servidor + móvil |
| `npm run test:e2e:chain` | E2E con wallet: Lanzador completo + comprar, forjar, jugar, canjear, vender y Arena |
| `npm run balance -- 8 spark 1` | Juega 8 partidas con el bot para medir dificultad y recompensas |
| `npm run economy -- --md` | Proyección económica a 24 meses (regenera `docs/PROYECCION.md`) |

## Lanzar en BNB Chain desde el celular (Lanzador)

La forma más simple, sin computadora y sin compartir claves:

1. Publica el cliente (`npm run build` → carpeta `dist/`) en un hosting estático gratuito.
2. Abre `https://TU-SITIO/lanzar.html` desde el navegador de tu wallet (MetaMask, Trust Wallet o Binance Web3 Wallet).
3. Elige **BNB Chain Testnet** para probar o **BNB Chain** para la red real, pon nombre y símbolo a tu token y toca **Crear**.
   Son 8 confirmaciones. En la red real cuestan en total **≈ 0,0005 BNB (menos de $1)**. Si la app se cierra, continúa donde quedó.
4. Al terminar: eres dueño de todos los contratos, la tesorería es tu wallet y tienes el 45% del suministro + 15% en vesting.
   Copia la configuración: es el `DEPLOYMENT_FILE` del servidor.
5. Desde la sección **Administración** del Lanzador cobras las ventas de naves y registras la dirección del servidor como firmante.

## Lanzar desde la terminal (alternativa)

1. Copia `.env.example` a `.env` y completa `DEPLOYER_PRIVATE_KEY`, y `RIFT_OWNER` y `RIFT_TREASURY` (tu wallet o una Safe).
   Completa también `RIFT_SIGNER`: la dirección de una clave nueva, solo para el servidor.
2. `npm run deploy:testnet` (BNB Chain Testnet) → genera `deployments/97.json`. Para la red real: `npm run deploy:mainnet` (BSC, 56).
   Otras redes: `npm run deploy:base-testnet` / `npm run deploy:base`.
3. Configura el servidor en `.env`: `DEPLOYMENT_FILE=deployments/97.json`, `RPC_URL`, `SIGNER_PRIVATE_KEY`, `ADMIN_TOKEN` y `ARENA_AUTO=1`.
4. `npm run build && npm start`.
5. Antes de ir a la red real, sigue el checklist de [`docs/ECONOMIA.md`](docs/ECONOMIA.md#12-checklist-de-lanzamiento).

**Hosting:** cualquier servicio que ejecute Node de forma continua (Railway, Render, Fly.io o un VPS) sirve.
Un solo proceso entrega el juego y la API. Haz copias de seguridad de `server/data/`.
Para miles de jugadores concurrentes, migra `server/db.mjs` a Postgres o Supabase.

**Seguridad de claves:** la clave del deployer y la de la Safe nunca van al servidor. La del servidor
(`SIGNER_PRIVATE_KEY`) solo puede firmar vales dentro de los topes diarios. Si se filtra, pausa el vault,
llama a `setSigner` con una nueva y reanuda.

## Licencias

Código propio del proyecto. Dependencias: OpenZeppelin Contracts (MIT), ethers (MIT), Hardhat (MIT), Vite (MIT),
fuentes Orbitron y Rajdhani (SIL Open Font License). Todos los gráficos y sonidos se generan por código.
