# Rift Cargo — Economía cripto (propuesta)

> Propuesta para decidir antes de construir. Se apoya en lo que ya existe para RIFTFALL
> (token $RIFT, `RewardVault`, vales firmados por el servidor, Mercado, pagos en USDT del Pase Fundador),
> todo probado en la testnet de BNB Chain. Ver también [`ECONOMIA.md`](ECONOMIA.md).

## 1. La idea en 30 segundos

- **Una sola moneda para los dos juegos: $RIFT.** Rift Cargo no crea otro token. Los dos juegos comparten el
  mismo pozo de recompensas y el mismo tope por jugador, así que jugar a los dos no paga el doble.
  Hay más formas de gastar $RIFT, y eso le da más uso.
- **Los créditos ($) del juego siguen siendo dinero de juego** y no se canjean. Si se pudieran canjear, los bots
  vaciarían el pozo en una semana (un juego de gestión se juega solo con un script).
- **$RIFT se gana solo con «Contratos Rift»**: pocos por día, con reloj que lleva el servidor y con pago que sale
  de un presupuesto diario fijo.
- **Lo que se vende:**
  1. Naves de flota NFT.
  2. **Mejoras grabadas en la nave NFT**: si vendés la nave, la mejora va con ella.
  3. Estéticos.
- **Cada $RIFT gastado se reparte como en la Forja:** 40% se quema, 30% vuelve al pozo de jugadores y 30% va a tu tesorería.
- **Regla de oro:** comprar mejoras no fabrica $RIFT nuevo. Te deja hacer mejores contratos dentro del mismo
  presupuesto diario, que es fijo y se reduce a la mitad cada 180 días.

## 2. Las capas

| Capa | Dónde vive | Cómo se consigue | Para qué sirve |
|---|---|---|---|
| **Créditos $** | Partida (navegador) | Pedidos, fletes, mercado | Naves comunes, muelles, drones, depósito. **No se canjean** |
| **Shards ◆** | Servidor | Contratos Rift (y RIFTFALL) | Se canjean por $RIFT con el vale firmado de siempre |
| **$RIFT** | BNB Chain (ERC-20) | Canjear Shards o comprar en un DEX | Mejoras de naves NFT, estéticos, naves NFT, Mercado |
| **Naves de flota NFT** | BNB Chain (ERC-721) | Comprándolas (BNB o $RIFT) o en el Mercado | Licencia de Contratos Rift + ranuras de mejora |
| **Estéticos** | NFT (de temporada) o en la cuenta (comunes) | Comprándolos | Solo se ven. **No dan ventaja** |

```
 Jugar Cargo ──► Contratos Rift ──► Shards ──(vale EIP-712)──► $RIFT ──► mejoras · estéticos · naves NFT
       ▲                                                                   │
       │                      40% se quema · 30% vuelve al pozo ◄──────────┤
       └──── naves mejoradas = contratos más grandes ◄── 30% tu tesorería ◄─┘
```

## 3. Contratos Rift: la única fuente de $RIFT en Cargo

- **Cuántos hay:** cada licencia da 2 contratos por día; propuesta híbrida en la sección 9.
- **Quién lleva el reloj: el servidor, no el navegador.**
  1. Al aceptar un contrato, el servidor lee la nave NFT en la cadena (modelo y mejoras) y calcula cuánto tarda el viaje.
  2. Antes de esa hora no paga.
  3. No hace falta re-jugar toda la partida para verificarla, que en un juego de gestión sería imposible.
- **Cuánto paga:**
  - Base: el presupuesto de Cargo del día dividido por los contratos que se esperan ese día.
  - Ajuste: escala con toneladas, distancia y si llegó a tiempo.
  - Con más jugadores, cada contrato paga menos; así la emisión nunca se pasa del presupuesto.
- **Presupuesto:**
  - Cargo usa una parte del presupuesto diario del `RewardVault` (propuesta: 30%) y RIFTFALL el resto.
  - El reparto se cambia en el servidor sin tocar contratos.
- **Tope por jugador:** el mismo del vault (3.000 $RIFT/día), compartido entre los dos juegos.
- **Variedad:** contratos de cinturón (más riesgo, +25% de pago, piden escudo), contratos pesados (piden bodega
  grande) y urgentes (piden motor). Ahí es donde las mejoras importan.

## 4. Naves de flota NFT

- **Las naves comunes no cambian:** Colibrí, Mula y Titán se siguen comprando con créditos, como hoy. Se juega gratis.
- **Hay versiones NFT de serie limitada,** con librea propia y numeración. Cada una es **una licencia de Contratos Rift**
  y trae **4 ranuras de mejora**.

| Nave NFT | Base | Precio BNB | Precio $RIFT | Unidades |
|---|---|---:|---:|---:|
| Colibrí Rift | Colibrí | 0,01 (~$8) | 2.000 | 3.000 |
| Mula Neón | Mula | 0,03 (~$25) | 6.000 | 1.500 |
| Titán Aurora | Titán | 0,075 (~$60) | solo BNB | 500 |
| (1 clase nueva por temporada) | | | | |

- **Imagen y metadatos on-chain**, como las naves de RIFTFALL: se ven en cualquier wallet o marketplace.

## 5. Mejoras reales de vehículos (lo que pediste)

Son 4 ranuras por nave NFT, con niveles del 1 al 5. Subir del nivel L al L+1 cuesta **150 × L² $RIFT**:
150, 600, 1.350, 2.400. Llevar una ranura al máximo cuesta 4.500 $RIFT y una nave completa, 18.000.

| Ranura | Efecto por nivel | Qué destraba |
|---|---|---|
| **Motor** | +6% de velocidad (máx. +24%) | Contratos urgentes |
| **Bodega** | +10% de capacidad (máx. +40%) | Contratos pesados |
| **Escudo** | −20% de penalización por demora | Rutas por el cinturón (+25% de pago) |
| **Computadora** | Nivel 3: piloto automático en Contratos Rift. Nivel 5: +1 contrato por día | Jugar menos pendiente del celular |

- **La mejora queda grabada en el NFT**, en la cadena. Una nave mejorada vale más en el Mercado y eso mueve el
  comercio entre jugadores, que es lo que buscás.
- **Hay un límite a propósito:** una nave al máximo gana como mucho **~1,5×** lo que gana una nave NFT sin mejorar,
  y siempre dentro del tope diario por jugador. Así comprar sirve, pero no rompe el juego ni el token.
  - Los efectos no se multiplican sin freno: el pago de los contratos pesados, urgentes y de cinturón se calibra
    para que todas las mejoras juntas no pasen de ese 1,5×.
  - Se comprueba con una simulación, como la de `PROYECCION.md`.
- **El gasto se reparte:** 40% se quema, 30% vuelve al pozo y 30% va a tu tesorería. Es el sumidero principal del juego.

## 6. Estéticos: el ingreso más sano

Los estéticos no dan ventaja, así que no tienen riesgo legal de «inversión» y son lo que más se compra en juegos
free-to-play.

- **Libreas:** pinturas por nave. Neón, Carbono, Aurora, y Dorado para los Fundadores.
- **Matrícula personalizada:** tu nombre en la nave. La placa ya existe en los modelos 3D.
- **Estela de motores, skins de drones y decoración de la estación:** cartel con tu nombre, hologramas, árboles neón, piso.
- **Dos formatos:**
  - **Comunes:** se pagan en USDT o BNB ($1 a $3), quedan en la cuenta y no son NFT, así que no hace falta pagar gas.
  - **De temporada:** NFT limitados ($5 a $10, o en $RIFT), revendibles en el Mercado.

## 7. Mercado

- **Compra-venta entre jugadores** de naves NFT (con sus mejoras) y estéticos de temporada.
- **Comisión** del 5% para tu tesorería, más 5% de regalías si se revenden en OpenSea u otros marketplaces.
- **Hace falta un contrato nuevo:** el Mercado actual está atado a las naves de RIFTFALL. Propuesta: un Mercado que
  acepte varias colecciones de una lista aprobada, así sirve para los dos juegos.

## 8. Qué ganás vos

1. **El 100% del BNB y USDT** de naves NFT y estéticos. Es el ingreso principal y no depende del precio del token.
2. **El 30% de cada $RIFT gastado** en mejoras, estéticos y naves.
3. **El 5% del Mercado** y **el 5% de regalías**.

## 9. Salud del token: reglas fijas

- **Sumideros ≥ fuentes.**
  - El servidor publica cada semana cuánto $RIFT se emitió y cuánto se gastó o quemó.
  - Si dos semanas seguidas se emite más de lo que se gasta, baja el pago por contrato (`RIFT_PER_SHARD`).
- **Licencias, propuesta híbrida:**
  - Todo jugador con wallet tiene 1 Contrato Rift chico por día, gratis.
  - Cada nave NFT suma 2 contratos.
  - Se cuentan hasta 3 naves por jugador.
  - Así se puede ganar sin pagar, pero una granja de bots rinde poco.
- **Lo que no vamos a hacer:**
  - **Rendimiento prometido:** nada de staking con APY ni «comprá X y ganá Y por día». Mantiene la línea legal de `FINANCIAMIENTO.md`.
  - **Cajas sorpresa pagadas con $RIFT o dinero:** son juego de azar. Todo estético se ve antes de comprarlo.
  - **Pozo que se paga con lo que depositan otros jugadores:** las recompensas salen del pozo fijo de `RewardVault`.

## 10. Riesgos que conviene mirar con un abogado antes de la red principal

- **Mejoras que aumentan recompensas:** vender algo que hace ganar más token puede leerse como inversión
  (por ejemplo, el test de Howey en EE. UU.). Lo bajan el límite de ~1,5×, el tope diario, que el ingreso principal
  sean estéticos y naves, y no prometer ganancias. Aun así, conviene revisarlo.
- **Argentina:** la Ley 27.739 creó el registro de Proveedores de Servicios de Activos Virtuales (PSAV) en la CNV.
  Hay que confirmar si un juego con mercado en contrato inteligente, sin custodiar fondos de terceros, entra o no.
- **Impuestos:** las ventas de naves y estéticos son ingresos tuyos.
- **Términos y condiciones** del juego que dejen claro que $RIFT es un objeto del juego, no una inversión.

## 11. Plan por etapas

| Etapa | Qué | Necesita | Riesgo |
|---|---|---|---|
| **1. Estéticos** | Libreas, matrícula, estelas y decoración pagadas en USDT/BNB (mismo flujo verificado en la cadena que el Pase Fundador) | Nada nuevo: tu wallet de tesorería | Muy bajo |
| **2. Naves NFT + mejoras + Mercado** | Contrato de flota con ranuras de mejora, Mercado multi-colección; primero en testnet | Contratos nuevos + auditoría liviana | Medio |
| **3. Contratos Rift en $RIFT** | Reloj en el servidor, Shards y vales | Servidor en línea, token en red principal, pool de liquidez abierto | El más alto |

**Decisiones tomadas:** empezar por los estéticos (etapa 1) y, cuando lleguen los Contratos Rift, usar el modelo
híbrido de licencias (1 contrato gratis por día con wallet, +2 por nave NFT, hasta 3 naves).

**Etapa 1: hecha.** El Taller de estilo está en el juego. El catálogo, los precios y cómo se verifica cada
pago están en [`RIFT-CARGO.md`](RIFT-CARGO.md#taller-de-estilo-estéticos-pagados).

Recomendación: **empezar ya por la etapa 1.** Genera ingreso sin tocar el token, prueba si los jugadores pagan
por verse bien y deja la estructura lista (pagos, inventario, Fundadores) para las etapas 2 y 3.
