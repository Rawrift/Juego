# RIFTFALL — Diseño económico

> Documento para el creador del juego. Explica cómo circula el valor, de dónde salen tus ingresos,
> qué parámetros puedes ajustar y qué riesgos conviene cubrir antes de lanzar en mainnet.
> Las cifras de proyección están en [`PROYECCION.md`](PROYECCION.md) (regenerables con `npm run economy -- --md`).

## 1. Resumen en 30 segundos

**Cómo ganas dinero (de mayor a menor peso en el modelo):**

1. **Venta de naves NFT en ETH.** Es el ingreso principal. El 100% del ETH de las ventas va a tu tesorería.
2. **El 30% de cada RIFT gastado** en Forja y en compras de naves con RIFT.
3. **El 10% (rake) de cada torneo de Arena.**
4. **El 5% de cada venta en el Mercado** entre jugadores.
5. **Regalías ERC-2981 del 5%** cuando las naves se revenden en OpenSea u otros marketplaces.
6. **Comisiones de liquidez**: aportas el 15% del suministro al pool RIFT/ETH y cobras el 0,3% de cada intercambio.
7. **Reservas**: el 20% de tesorería y el 15% del equipo, este último bloqueado 6 meses y liberado en 24.

**Por qué no es un esquema piramidal:** los jugadores no cobran del dinero que depositan otros
jugadores. Cobran de un **pool fijo** (40% del suministro) con emisión que se reduce a la mitad
cada 180 días. Tú cobras por **vender productos** (naves) y **servicios** (torneos, mercado), como
cualquier juego free-to-play. Esto hace el proyecto más defendible legalmente y más sostenible.

## 2. Las tres capas de valor

| Capa | Dónde vive | Cómo se obtiene | Para qué sirve |
|---|---|---|---|
| **Shards ◆** | Servidor (off-chain) | Jugando: jefes, élites, tiempo sobrevivido, victoria, misiones diarias, racha | Se canjean por $RIFT (con límites) |
| **$RIFT** | Blockchain (ERC-20) | Canjeando Shards o comprando en un DEX | Forja, naves, Arena, Mercado |
| **Naves NFT** | Blockchain (ERC-721) | Comprándolas en ETH/RIFT o en el Mercado | Arma inicial, stats y multiplicador de Shards (x1,10 a x1,77) |

Flujo completo:

```
 Jugar ──► Shards ──(vale EIP-712 firmado por el servidor)──► $RIFT ──► Forja / Arena / Mercado / Naves
   ▲                                                                       │
   │                         40% se quema · 30% vuelve al pool ◄───────────┤
   └────────── naves más fuertes, mejor botín ◄── 30% a tu tesorería ◄─────┘
```

## 3. Tokenomics de $RIFT

| Propiedad | Valor |
|---|---|
| Suministro | **1.000.000.000 RIFT, fijo** (no existe función de minteo) |
| Impuestos por transferencia | Ninguno (compatible con cualquier DEX y wallet) |
| Listas negras / congelar fondos | No existen |
| Estándares | ERC-20 + Permit (EIP-2612) + Burnable |
| Red recomendada | **Base** (comisiones de céntimos y usuarios de Coinbase). Funciona en cualquier red EVM. |

| Asignación | % | Destino | Bloqueo |
|---|---:|---|---|
| Recompensas de jugadores | 40% | `RewardVault` | Emisión diaria con halving; el owner no puede retirarlo |
| Tesorería | 20% | Tu multisig | — |
| Liquidez | 15% | Pool RIFT/ETH en un DEX | Recomendado: bloquear el LP 12 meses |
| Equipo (tú) | 15% | `TeamVesting` | Cliff 6 meses + 24 meses lineal |
| Comunidad | 10% | Tu multisig | Para airdrops, misiones de lanzamiento y creadores de contenido |

## 4. Emisión para jugadores (RewardVault)

- **Presupuesto diario:** 1.000.000 RIFT, que se reduce a la mitad cada 180 días: 500k, luego 250k…
  Emisión máxima teórica: ~360M; el resto del vault, junto con lo que vuelve por los sumideros, alarga su vida indefinidamente.
- **Tope por jugador:** 3.000 RIFT/día. Limita a los bots y a las granjas de cuentas.
- **Vales:** el servidor firma `Claim(player, amount, claimId, deadline)` con EIP-712. Cada vale vale una
  sola vez y caduca en 1 hora. Si caduca sin cobrar, el servidor devuelve los Shards automáticamente.
- **Garantías para los jugadores:**
  - `setEmission` solo permite **bajar** la emisión, nunca superar la inicial.
  - No hay función de retiro. Solo se puede migrar el pool a un vault nuevo con un **aviso público de 14 días**.
  - Se puede pausar ante una emergencia.
- **Tasa Shards→RIFT:** se configura en el servidor (`RIFT_PER_SHARD`, por defecto 1). Es tu palanca diaria más fina.

## 5. Naves NFT (RiftShips)

| Clase | Precio ETH | Precio RIFT | Unidades | Arma inicial | Multiplicador base |
|---|---:|---:|---:|---|---:|
| SPARK | gratis (no es NFT) | — | ∞ | Pulse Blaster | x1,00 |
| VANGUARD | 0,004 | 2.500 | 5.000 | Nova Pulse | x1,10 |
| PHANTOM | 0,01 | 6.000 | 3.000 | Cuchillas Orbitales | x1,20 |
| TEMPEST | 0,025 | 15.000 | 1.500 | Bobina de Arco | x1,30 |
| LEVIATHAN | 0,08 | solo ETH | 300 | Misiles Buscadores | x1,50 |

- **Forja:** subir del nivel L al L+1 cuesta `200 × L²` RIFT (200, 800, 1.800 … 16.200).
  Llevar una nave a nivel 10 cuesta **57.000 RIFT**. Cada nivel suma +2% de daño y +3% de botín.
- **Metadatos e imagen 100% on-chain** (SVG): las naves se ven en cualquier wallet o marketplace sin servidores.
- **Temporadas:** con `addClass` publicas naves nuevas cada trimestre. Es tu motor de ventas recurrente;
  el modelo supone un 0,4% de compra mensual entre los jugadores existentes.
- **Equilibrio pagar/ganar:** las naves dan ventaja, pero la SPARK gratuita puede ganar la partida.
  La **Arena** obliga a todos a usar la SPARK: ahí solo cuenta la habilidad.

## 6. Sumideros: a dónde va cada RIFT gastado

| Acción | Quema | Vuelve al pool de jugadores | Tu tesorería |
|---|---:|---:|---:|
| Forja / compra de nave en RIFT | 40% | 30% | 30% |
| Inscripción de Arena | 5% | premios no asignados | 10% |
| Venta en el Mercado | — | — | 5% |

Límites fijos en los contratos, que generan confianza porque nadie puede cambiarlos:
la tesorería nunca recibe más del **50%** del reparto de Forja, la comisión del Mercado tiene un tope del **10%**,
el rake de la Arena del **15%** y la quema de Arena del **10%**. Las regalías no pueden pasar del **10%**.

## 7. Proyección resumida

| | Conservador | Base | Optimista |
|---|---:|---:|---:|
| Jugadores mensuales al mes 24 | ~8.600 | ~85.000 | ~300.000 |
| Neto año 1 | ~$6.200 | ~$92.000 | ~$650.000 |
| Neto año 2 | ~$19.000 | ~$390.000 | ~$2,9 M |

Detalle, supuestos y salud del token: [`PROYECCION.md`](PROYECCION.md). **Lectura honesta:** el ingreso depende casi
por completo de **cuántos jugadores consigas**. Sin inversión en marketing, la mayoría de los juegos web3 se quedan
en cientos de jugadores, y el ingreso apenas cubre el servidor. El juego, la economía y el anti-trampas
están listos; la adquisición de jugadores es el trabajo que queda.

## 8. Palancas de ajuste

| Síntoma | Palanca | Dónde |
|---|---|---|
| El precio de RIFT cae (los jugadores venden más de lo que gastan) | Bajar `RIFT_PER_SHARD` (p. ej. 0,5) | Variable de entorno del servidor |
| Emisión demasiado alta | `setEmission(base, topePorJugador)` (solo hacia abajo) | Contrato `RewardVault` |
| Pocas compras de naves | Temporada nueva (`addClass`), ajustar precios (`setClass`) | Contrato `RiftShips` |
| Demasiados RIFT sin uso | Subir el coste de Forja (`setForgeBaseCost`) | Contrato `RiftShips` |
| Quieres más ingreso o más quema | `setSplit(quema, pool)` (tesorería ≤ 50%) | Contrato `RiftShips` |
| Mercado poco activo / caro | `setFee` (≤ 10%) | Contrato `RiftMarket` |
| Arena con poco bote | Patrocinar botes con `sponsor()` desde la tesorería (marketing) | Contrato `RiftArena` |
| Arena: cuota, duración, rake | `ARENA_FEE`, `ARENA_HOURS` o el endpoint admin | Servidor |
| Retención baja | Recompensas de misiones y racha | `server/economy.mjs` |
| Partidas muy fáciles o difíciles | Dificultad, armas y botín | `src/sim/content.js` (+ `npm run balance`) |

**Recomendación de lanzamiento:** empieza con `RIFT_PER_SHARD=0.5` y patrocina los primeros torneos de Arena desde
la tesorería. Así hay sumideros con demanda real antes de que la emisión llegue a su ritmo completo; el modelo muestra
que los primeros meses son los de mayor presión vendedora.

## 9. Anti-trampas: "Proof of Play"

1. **Simulación determinista:** el juego corre a 60 ticks/s fijos, con semilla y matemática propia
   (sin funciones trigonométricas del navegador). La misma semilla con las mismas entradas da el mismo resultado en cualquier motor.
2. **Re-simulación en el servidor:** al terminar, el cliente envía solo sus entradas (comprimidas). El servidor
   re-juega la partida completa en un worker y **calcula él mismo** las recompensas. Lo que diga el cliente no cuenta.
3. **Anti speed-hack:** la partida debe durar en tiempo real al menos el 90% de lo simulado.
4. **Naves verificadas on-chain:** el servidor comprueba que la nave es de tu wallet y lee su clase y nivel del contrato.
5. **Arena:** semilla aleatoria por partida (no se puede pre-calcular la ruta óptima) y nave obligatoria SPARK.
6. **Replays públicos:** `GET /api/replay?id=…` permite a cualquiera auditar una partida. Revisa el top antes de liquidar torneos grandes.
7. **Límites económicos:** tope diario por jugador, presupuesto global, wallet obligatoria para canjear y límite de peticiones por IP.

Límite conocido: un bot que juegue en tiempo real puede ganar Shards como un humano. Los topes diarios acotan el daño.
Si aparece a escala, añade captcha o verificación de humanidad (World ID, Gitcoin Passport) solo para el canje.

## 10. Seguridad y confianza

- Contratos con OpenZeppelin 5, `Ownable2Step` (la transferencia de propiedad requiere aceptación) y `ReentrancyGuard`.
- **Usa una multisig Safe como owner y tesorería** (`RIFT_OWNER`, `RIFT_TREASURY` al desplegar).
- La clave del servidor que firma vales (`SIGNER_PRIVATE_KEY`) es una clave "caliente" con poder limitado: en el peor
  caso alguien podría cobrar el presupuesto de un día. Si se filtra: `pause()`, luego `setSigner(nueva)` y `unpause()`.
- 22 tests de contratos, 10 tests de simulación y servidor, 1 test de integración on-chain y 3 tests E2E en el navegador.
- **Antes de mainnet:** auditoría externa o, como mínimo, Slither y una revisión independiente. Publica los contratos verificados en Basescan.

## 11. Aspectos legales (léelo antes de lanzar)

Esto no es asesoramiento legal. Lo que sigue son los puntos que suelen importar:

- **Valores:** no prometas rentabilidad ni vendas $RIFT como inversión. El script de despliegue **no incluye preventa**,
  a propósito. Presenta el token como moneda de un juego con utilidad.
- **Juegos de azar:** el diseño evita las cajas de botín pagadas con resultado aleatorio. Todas las compras son deterministas.
  Los torneos con inscripción y premio son "competiciones de habilidad", reguladas en algunos países y estados:
  bloquea por geolocalización donde haga falta.
- **Impuestos:** las ventas de NFT, las comisiones y los tokens recibidos suelen ser ingresos imponibles. Lleva contabilidad desde el día 1.
- **KYC/AML:** según tu país y volumen, puede ser obligatorio para canjes grandes.
- **Términos de servicio y política de privacidad**, edad mínima de 18 años y aviso de riesgo de criptoactivos en el sitio.

## 12. Checklist de lanzamiento

1. `npm run deploy:testnet` en Base Sepolia y prueba con 20–50 jugadores reales.
2. Recalibra la dificultad (`npm run balance`) y la economía (`npm run economy`) con sus datos.
3. Audita los contratos.
4. Crea una Safe multisig y despliega en Base con `RIFT_OWNER` y `RIFT_TREASURY` apuntando a ella. Acepta la propiedad (`acceptOwnership`).
5. Verifica los contratos en Basescan (`npx hardhat verify`).
6. Crea el pool RIFT/ETH (Aerodrome o Uniswap) con la asignación de liquidez y **bloquea el LP**.
7. Despliega el servidor (ver README) con copias de seguridad de `server/data/`.
8. Lanzamiento: Arena con bote patrocinado, misiones de la comunidad (10%) y creadores de contenido.
9. Cada semana: revisa `/api/economy`, el precio de RIFT y el ratio de compra/venta, y ajusta las palancas de la sección 8.
