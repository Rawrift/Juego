# Financiamiento: cómo cobrar antes del token y de dónde sale el BNB

Resumen en una línea: **el lanzamiento real cuesta menos de 1 dólar en BNB, y el juego ya puede cobrar hoy
por dos vías que no necesitan el token**: el Pase Fundador (pagos en la red principal, directo a tu wallet) y la
versión para portales con publicidad (CrazyGames). Los grants de BNB Chain vienen después, cuando haya jugadores que mostrar.

> **Regla de oro:** nadie (ni yo, ni un "manager de grants", ni "soporte de Binance") necesita tus 12 palabras
> ni tu clave privada para pagarte o darte un grant. Quien te las pida es un estafador, sin excepción.

---

## 1. Cuánto BNB hace falta de verdad

| Qué | Costo en la red principal | Nota |
|---|---|---|
| Crear el token y los 6 contratos (Lanzador) | **≈ 0,0005 BNB (≈ US$0,40)** | ~10,5 M de gas a 0,05 gwei, BNB ≈ US$787 (5 oct. 2026) |
| Margen recomendado | **0,001 BNB (≈ US$0,80)** | Por si el gas sube o una confirmación se repite |
| Recibir pagos del Pase Fundador | **0** | Quien paga, paga su propio gas |

Para lanzar el token **no hace falta liquidez el primer día**: el pool RIFT/BNB en PancakeSwap se abre después,
con plata de las ventas (ver [`ECONOMIA.md`](ECONOMIA.md)).

## 2. De dónde sacar ese BNB sin poner plata

En orden de preferencia:

1. **El primer Pase Fundador pagado en BNB.** El nivel Piloto (US$3) son ≈ 0,0038 BNB: cubre el lanzamiento
   unas 7 veces. Llega directo a tu wallet `0x09aF2acF700d6Be84009655fB814a5311DAEc7Dd`.
2. **Un pago en USDT del Pase.** Con US$3 en USDT cambias una parte por BNB en tu wallet (MetaMask → Intercambiar,
   o PancakeSwap). Ojo: para hacer ese cambio necesitas un poquito de BNB para el gas, así que la opción 1 o la 3 van primero.
3. **Un amigo que te mande 0,001 BNB** a tu dirección pública. Es menos de un dólar; con compartir la dirección alcanza
   (la dirección es pública, se puede compartir sin riesgo).
4. **Comprar el mínimo en Binance P2P** con pesos y retirarlo a tu wallet por la red **BNB Smart Chain (BEP-20)**.

**Lo que no sirve:** los faucets dan BNB de *testnet* (tBNB), que no vale nada en la red principal. Las páginas
de "BNB gratis" que piden conectar la wallet o firmar algo son drainers.

## 3. Cobrar antes del token

### 3.1 Pase Fundador (ya está publicado)

Está en el menú del juego, en el cartel dorado **Pase Fundador**. Los jugadores pagan en la red principal de
BNB Chain, en **USDT o BNB**, directo a tu wallet: no hay contratos ni intermediarios, y el juego verifica el pago
en la cadena antes de dar los beneficios.

| Nivel | Precio | Qué recibe |
|---|---|---|
| Piloto | US$3 | Insignia de Fundador y estela dorada |
| Oro | US$10 | Lo anterior + pintura dorada para todas las naves |
| Leyenda | US$25 | Lo anterior + pintura Prisma + nave LEVIATHAN (NFT) en su wallet cuando el juego salga a la red principal |

**Cómo ver lo que entró:**
- En BscScan: `https://bscscan.com/address/0x09aF2acF700d6Be84009655fB814a5311DAEc7Dd` (pestañas *Transactions*
  para BNB y *Token Transfers (BEP-20)* para USDT).
- En MetaMask, en la red BNB Chain. Si no ves el USDT, agrégalo como token: `0x55d398326f99059fF775485246999027B3197955`.

**Cómo pasarlo a pesos:** envía el USDT a tu cuenta de Binance por la red BEP-20 y véndelo en Binance P2P.

**Cómo vender más:**
- Comparte el juego con el texto del botón "Compartir" del final de cada partida: lleva el link.
- Publica los beneficios en tus redes con una captura de la estela dorada o de la pintura Prisma (hay capturas del juego en `docs/img/`).
- Los compradores que cambian de celular o de navegador recuperan el Pase en el mismo panel, en
  **¿Ya pagaste desde otro dispositivo?**: pegan el hash del pago y tocan **Verificar**.

**Promesas que el Pase NO hace (y conviene que nunca haga):** no es una inversión, no reparte ganancias y no promete
tokens ni precio futuro. Es apoyo al juego a cambio de objetos cosméticos. La LEVIATHAN es una nave del juego que se entrega
cuando lancen los contratos reales. Ver sección 6.

### 3.2 CrazyGames: publicidad sin cripto

CrazyGames es uno de los portales de juegos web más grandes. La versión para portales ya está hecha:
- **Archivo:** `riftfall-crazygames.zip` (≈ 1,4 MB, 27 archivos), generado con `npm run zip:portal`.
- **Requisitos que cumple:** inglés (y español/portugués automáticos), celular y tablet, entra a jugar con 1 clic,
  sin enlaces externos, pesa muy por debajo del límite de 50 MB de descarga inicial (20 MB para aparecer en el inicio móvil).
- **Qué cambia respecto de la web:** se ocultan la wallet, el token, la tienda y el Pase Fundador, para cumplir las
  reglas del portal; queda el juego completo con Taller, Habilidades, desafío diario y niveles de Grieta.
- **Publicidad ya integrada (SDK v3):** un anuncio entre partidas, uno opcional con recompensa para **revivir**
  y otro para **duplicar los Núcleos** del final de la partida.

**Pasos (los haces tú, porque es tu cuenta):**
1. Crea la cuenta de desarrollador en **https://developer.crazygames.com** y entra a *Submit a game*.
2. Sube `riftfall-crazygames.zip`, carga capturas (hay en `docs/img/`), el título **RIFTFALL** y la descripción.
3. **Basic Launch:** el juego sale para una audiencia limitada entre 7 y 21 días, **sin ingresos**, para medir
   si la gente juega y vuelve.
4. **Full Launch:** si los números dan, te invitan al lanzamiento global y se activan los anuncios. CrazyGames paga una
   parte de lo que generan los anuncios, todos los meses, por Tipalti, a partir de €100 acumulados.

Para regenerar el ZIP después de cambios: `npm run zip:portal`.

### 3.3 Otras vías (para más adelante)

- **Telegram:** las Mini Apps de Telegram solo permiten la blockchain TON, así que ahí iría la versión sin cripto
  (como la de CrazyGames) cobrando con Telegram Stars. Sirve más para conseguir jugadores que para cobrar en BNB.
- **Referidos:** dar Núcleos o una pintura a quien invite amigos. Necesita el servidor publicado (el que ya existe en
  `server/`), porque si lo hace solo el navegador cualquiera se lo inventa.

## 4. Grants de BNB Chain

| Programa | Qué da | Cuándo conviene |
|---|---|---|
| **BNB Chain Grants** | Hasta US$200.000 por proyecto, pagado por hitos; ganadores cada 2 meses | Después del lanzamiento en la red principal, con los primeros números de jugadores |
| **MVB (Most Valuable Builder)** | Programa de aceleración con mentores de YZi Labs y CMC Labs, paquete de lanzamiento e inversión posible; postulación abierta todo el año | Exige transacciones y contratos en BNB Chain (red principal): después del lanzamiento |
| **Gas Grants** | Fondos para pagar el gas de los usuarios | Cuando haya jugadores haciendo transacciones |

- Página oficial: https://www.bnbchain.org/en/grants
- Formulario de BNB Chain Grants: https://forms.monday.com/forms/0469580c0e412266a888526a38b114a0?r=euc1
- Lista de deseos (qué buscan financiar): https://github.com/bnb-chain/community-contributions
- Formulario MVB: https://forms.monday.com/forms/70545de45c2bb86f1e227c5714f793b7?r=euc1

**Antes de postular, ten listo:**
1. El juego en la red principal (token y contratos creados con el Lanzador).
2. Números reales de al menos 2–4 semanas: jugadores por día, partidas por jugador, cuántos vuelven al día siguiente,
   Pases Fundador vendidos. Son lo que más pesa.
3. Un correo y un usuario de X/Telegram del proyecto.
4. El repositorio público en GitHub, o al menos acceso para los revisores.

El borrador de abajo está en inglés porque los formularios son en inglés. Lo que va entre corchetes lo completas tú.

### 4.1 Borrador de postulación (BNB Chain Grants)

**Project name:** RIFTFALL

**One-liner:** A fast, skill-based arcade survival game for web and mobile, built for BNB Chain, where every reward is
backed by a server-verified replay of the run ("Proof of Play").

**Category:** GameFi

**Problem.** Most web3 games are farmed by bots and multi-accounts, so rewards leak to extractors and the token collapses.
They also feel like spreadsheets: players stay for the yield, not the game, and leave when the yield drops.

**Solution.**
- **A game people play for fun first.** Arcade survival in the style of Vampire Survivors / Archero: 10-minute runs
  that end with a final boss. It runs in any browser and installs as an app on mobile (PWA). English, Spanish and Portuguese.
- **Proof of Play.** The game simulation is deterministic: the server replays every run from its inputs and only
  pays rewards for runs it can reproduce, so edited scores and fake results cannot claim anything. Daily caps limit
  what any single account can extract.
- **A sustainable economy.** Rewards are signed as EIP-712 vouchers with daily caps. Sinks burn part of every RIFT spent
  on forging and ship purchases, plus Arena entry fees and a marketplace fee, with hard limits written into the
  contracts. A 24-month projection is published in the repository.
- **Free-to-play onboarding.** New players start without a wallet. Crypto is introduced only when they want to own
  their ships.

**What is already built** (live at https://riftfall.duckdns.org):
- The full game, with 10 difficulty tiers ("Rift levels"), a daily challenge with its own leaderboard, collectible ship
  parts (the Workshop), pilot talents and a final boss.
- 6 smart contracts deployed on BSC Testnet and owned by the creator: RIFT token (BEP-20), RewardVault (EIP-712
  vouchers with daily caps), RiftShips (ERC-721), RiftMarket, RiftArena and TeamVesting.
- A one-tap mobile Launcher that deploys all contracts from the creator's own wallet. No private key ever leaves the wallet.
- The Founder Pass is live on BSC mainnet: players pay in USDT or BNB, and the game verifies each payment on-chain.
- An automated test suite: unit tests for the simulation, server and payments; browser end-to-end tests; and
  end-to-end tests against a local chain with real wallet flows.

**Traction:** [players per day] · [runs per player] · [D1 retention %] · [Founder Passes sold] · [CrazyGames stage]

**Milestones and budget** (amounts are a suggestion, adjust them):

| # | Milestone | Deliverables | Time | Amount |
|---|---|---|---|---|
| 1 | Mainnet launch | Contracts on BSC mainnet, server with Proof of Play hosted, external security review of the vault and market | 4 weeks | US$[6.000] |
| 2 | Growth | Referral system, Telegram community, weekly tournaments in the Arena, CrazyGames full launch | 6 weeks | US$[8.000] |
| 3 | Season 1 | Ship NFTs tradable on the market, PvP Arena seasons, [1.000] monthly active players | 8 weeks | US$[11.000] |

**Team:** [Your name] — creator and developer. [Location]. [Links: X / GitHub / Telegram]

**Links:** game https://riftfall.duckdns.org · repository [URL] · contact [email]

## 5. Orden recomendado

1. **Esta semana:** comparte el juego y el Pase Fundador con amigos y grupos de cripto y de gamers. Con el primer pago en BNB
   ya tienes el gas del lanzamiento.
2. **En paralelo:** crea la cuenta de CrazyGames y sube el ZIP. El Basic Launch dura 7–21 días y te da números reales.
3. **Con el primer BNB:** lanza el token y los contratos en la red principal con el Lanzador (ver README).
4. **Con 2–4 semanas de números:** postula a BNB Chain Grants con el borrador de arriba. Después, a MVB.

## 6. Nota legal y de orden (no es asesoramiento legal ni contable)

- **El Pase Fundador es una venta de objetos cosméticos**, no una inversión. No prometas ganancias, reparto de
  ingresos, cantidades de token ni precio futuro, ni en el juego ni en redes. Esa es la línea que separa una venta
  de un juego de una oferta de inversión.
- **Nada de preventa del token.** Vender tokens antes del lanzamiento con promesa de valor es lo que más problemas
  legales trae en cripto.
- **Lleva un registro** de cada pago: fecha, hash, monto y moneda (BscScan te lo exporta en CSV). Consulta con un contador
  cómo declarar esos ingresos donde vives.
- **Cumple lo prometido:** si alguien compra Leyenda, la LEVIATHAN tiene que llegar en el lanzamiento.
- **Grants y "socios":** BNB Chain nunca cobra por postular ni pide tu frase semilla. Desconfía de cualquier mensaje privado
  que ofrezca "acelerar" tu grant.
