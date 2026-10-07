# Plan: vender los juegos, que se alimenten entre sí y juntar el BNB del token

Resumen en tres líneas:

1. **Crear el token real cuesta menos de 1 dólar en BNB** (≈ 0,0005 BNB; con margen, 0,001 BNB). La primera venta de
   cualquier cosa del juego ya lo cubre varias veces.
2. Lo que de verdad necesita BNB es el **pool de liquidez** en PancakeSwap. No conviene abrirlo el primer día:
   se abre con lo que entre por las ventas, cuando haya jugadores que usen el token.
3. El BNB se junta **vendiendo cosas del juego** (ya funciona) y con el **grant de BNB Chain** (hasta US$200.000,
   acepta juegos). Nada de preventa ni de prometer ganancias.

> **Regla de oro:** nadie necesita tus 12 palabras ni tu clave privada para pagarte, darte un grant o "verificar"
> nada. Quien te las pida es un estafador, sin excepción. Los pagos del juego llegan solos a tu wallet pública.

---

## 1. Cuánto BNB hace falta

| Qué | BNB | Cuándo |
|---|---|---|
| Crear el token y los contratos (Lanzador) | **0,001** (con margen) | Cuando quieras: lo paga la primera venta |
| Pool de liquidez RIFT/BNB, mínimo razonable | **1 BNB** (≈ US$790) | Con jugadores activos y el token ya usado dentro del juego |
| Pool cómodo (precio que no salta con cada compra) | **3 a 5 BNB** | Más adelante, con lo que siga entrando |

El pool se arma con el 15% del suministro (150 millones de RIFT) más ese BNB, y **el LP se bloquea** (queda a la vista
en BscScan que no se puede retirar). Eso es lo que da confianza; un pool chico y bloqueado es mejor que uno grande
sin bloquear.

## 2. De dónde sale ese BNB (en orden)

### 2.1 Ventas dentro de los juegos (ya publicadas, cobran directo a tu wallet)

Todo se paga en la red principal de BNB Chain, en USDT o BNB, a `0x09aF2acF700d6Be84009655fB814a5311DAEc7Dd`, y el
juego verifica cada pago en la cadena.

| Qué | Dónde | Precio |
|---|---|---|
| Pase Fundador (Piloto / Oro / Leyenda) | RIFTFALL, cartel dorado | US$3 / 10 / 25 |
| Taller de estilo (pinturas, estelas, matrícula, cartel) | Rift Cargo, menú o Flota | US$1 a 2 (pack US$7) |
| **Hangar Rift: planos de naves exclusivas (nuevo)** | Rift Cargo, Flota → Hangar Rift | US$3 livianas, US$5 medianas, US$8 pesadas |
| **Flota Rift: los 9 planos (nuevo)** | Hangar Rift | US$29 (US$48 sueltos) |

Cuánto falta para **1 BNB (≈ US$790)**: por ejemplo 27 Flotas, o 32 Pases Leyenda, o una mezcla como
10 Flotas + 10 Pases Oro + 60 planos sueltos. Cada venta se ve en BscScan (pestañas *Transactions* y *Token Transfers*).

Los Pases Fundador Oro y Leyenda ahora traen una nave exclusiva cada uno (Vencejo y Halcón Rift): sube el valor del
Pase sin tocar su precio.

### 2.2 Grant de BNB Chain (el más grande)

- Hasta **US$200.000 por proyecto**; la categoría **GameFi** está aceptada.
- Revisan las solicitudes y anuncian ganadores **cada 2 meses**, en dos rondas (relevancia y técnica; después plan e hitos).
- Además de la plata: difusión, soporte técnico y contactos del ecosistema.
- Se pide en <https://www.bnbchain.org/en/grants> (formulario). Antes conviene leer la "wishlist" que enlazan ahí.
- Lo que más pesa: que el proyecto ya funcione en BNB Chain y tenga usuarios. Por eso primero el lanzamiento chico
  del token y las ventas, y con esos números la solicitud.

El borrador de la solicitud está en la sección 5 (en inglés, que es como se presenta). Lo enviás vos desde tu
cuenta: yo no puedo crear cuentas ni mandar formularios a tu nombre.

### 2.3 Otras vías, en paralelo

- **Hackathons de BNB Chain**: en 2026 fueron sobre todo de IA, pero salen seguido y algunos tienen categoría libre
  o de consumo. Rift ya está hecho, así que se puede presentar tal cual cuando haya uno que acepte juegos.
- **MVB (aceleradora de BNB Chain)**: cuando haya tracción (jugadores y ventas), es el paso siguiente al grant.
- **DappBay** (el directorio de apps de BNB Chain): listar RIFTFALL y Rift Cargo es gratis y da visibilidad.
- **Portales sin cripto**: CrazyGames (publicidad) e itch.io; la versión para portales ya existe (`docs/ITCH.md`).

### 2.4 Lo que NO se hace

- Preventa del token, "inversores" que compran RIFT antes, o prometer precio o ganancias. Es riesgo legal y mata la
  confianza. Las compras del juego son objetos del juego, no inversiones (así lo dicen los textos del juego).
- Faucets: dan BNB de prueba, que no vale nada. Sitios de "BNB gratis" que piden conectar o firmar: son drainers.

---

## 3. Mostrar y vender los juegos: por separado y juntos

### 3.1 El papel de cada juego

| | RIFTFALL | Rift Cargo |
|---|---|---|
| Qué es | Arcade de naves, partidas de 3 a 8 minutos | Gestión de una empresa de carga en 3 sistemas estelares |
| Para qué sirve en el embudo | **La puerta de entrada**: se juega en un clic, en portales y en redes | **El juego de quedarse**: se vuelve todos los días, sigue ganando solo |
| Qué vende | Pase Fundador | Naves exclusivas, evolución, estilo |
| Dónde mostrarlo | Clips de 15 s de acción, desafío diario, duelos por WhatsApp | El Hangar Rift, los saltos entre portales, el mapa de 3 sistemas |

### 3.2 Cómo se alimentan entre sí (ya está hecho: "Ruta Rift")

- **RIFTFALL → Rift Cargo**: la primera partida da $2.500 en Rift Cargo; abrir el primer nivel del Rift, $10.000;
  ganar una partida, $25.000. El menú de Rift Cargo muestra el próximo premio.
- **Rift Cargo → RIFTFALL**: llegar al nivel 3 da 300 Núcleos; al 6 (se abre Umbra), 800; al 9 (Helios), 1.500.
- **Una sola cuenta** (Cuenta Rift) y una sola wallet para los dos; el Pase Fundador también regala naves en Rift Cargo.

Embudo: portales y redes → RIFTFALL (gratis, un clic) → Cuenta Rift → Rift Cargo (premio de bienvenida) →
compras (Pase, planos, estilo) → más adelante, el token.

### 3.3 Canales, del más barato al más caro

1. **Videos cortos** (TikTok, Reels, Shorts): 1 por día durante 3 semanas. Ideas: "construí una flota de 9 naves",
   el salto por el portal de Umbra, una nave pasando de Mk I a Mk III, un duelo de RIFTFALL ganado al último segundo.
2. **Reddit**: r/WebGames (RIFTFALL), r/incremental_games e r/idlegames (Rift Cargo), r/IndieGaming. Publicar como
   creador, contando cómo se hizo, sin hablar de token.
3. **Comunidades de BNB Chain y juegos web3** (X, Telegram): ahí sí se habla del token y de la Ruta Rift, siempre como
   "se va a usar dentro del juego", nunca como inversión.
4. **Portales**: CrazyGames (publicidad) e itch.io, con la versión sin cripto.
5. **DappBay**: ficha de RIFTFALL y Rift Cargo.

### 3.4 Calendario de 4 semanas

| Semana | Qué |
|---|---|
| 1 | Publicar la versión con Hangar Rift y 3 sistemas. Grabar 7 clips. Ficha en DappBay. |
| 2 | Un clip por día. Post en Reddit de cada juego. Subir RIFTFALL a itch.io. |
| 3 | Lanzar el token real con el Lanzador (0,001 BNB) y usarlo dentro del juego, sin pool. Página de transparencia. |
| 4 | Enviar el grant de BNB Chain con los números de las semanas 1 a 3. Con las ventas, abrir el pool y bloquear el LP. |

---

## 4. Lo que solo podés hacer vos

- Aprobar la publicación (el link de Cloudflare que te paso, o dejar el token de Cloudflare guardado en el entorno).
- Crear las cuentas de redes del juego (yo no creo cuentas a tu nombre) y subir los clips.
- Enviar el formulario del grant desde tu cuenta.
- Firmar en tu wallet el lanzamiento del token cuando decidas (el Lanzador te muestra todo antes de firmar).

---

## 5. Borrador de la solicitud al grant (inglés)

**Project name:** Rift (RIFTFALL + Rift Cargo)

**Category:** GameFi

**One-liner:** Two browser games on BNB Chain that feed each other: a one-click space arcade (RIFTFALL) as the front
door and a logistics management game across three star systems (Rift Cargo) as the long-term home, sharing one
account, one wallet connection and one in-game token.

**Problem:** Most GameFi games ask players to buy a token before they have fun, and their economies inflate because
rewards are not tied to real revenue.

**Solution:**
- Play first, crypto later: both games are free, run in any browser (phone or desktop) and work without a wallet.
- Wallet connection through WalletConnect from regular Chrome/Safari (no need for an in-wallet browser).
- Revenue from cosmetics and exclusive ship designs paid in USDT/BNB and verified on-chain, with no stat advantage.
- Planned with this grant: token rewards capped by a budget tied to that revenue (server-side ledger with signed
  vouchers, per-player caps and reputation gates), so emissions never exceed what the game earns.
- Planned with this grant: team and treasury tokens locked in public vesting contracts; liquidity locked.

**Traction (fill in with real numbers):** [monthly players], [daily players], [purchases and USD total], [countries].

**What exists today:** both games live at <https://riftfall.duckdns.org> and <https://riftfall.duckdns.org/cargo/>;
on-chain purchase verification on BNB Chain mainnet; token and contracts tested on BSC testnet; account system with
passkeys and wallet login; English, Spanish and Portuguese.

**Milestones and budget (proposal):**

| Milestone | Deliverable | Budget |
|---|---|---|
| M1 (1 month) | Token on mainnet with vesting and locked liquidity; transparency page | US$10k |
| M2 (2 months) | Token used in both games (forge, market, contracts) with the capped reward ledger; security review | US$20k |
| M3 (3 months) | Player-to-player ship market and seasonal events; 10k monthly players target | US$20k |

**Why BNB Chain:** low fees for frequent small in-game transactions, the largest retail user base, and stablecoin
payments (USDT) that players already use.

**Team:** [your name, country, role]. Contact: [email of the project].
