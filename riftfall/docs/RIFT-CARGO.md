# Rift Cargo

Segundo juego del universo Rift: una empresa de transporte espacial con aspecto de panel de control
(estilo maqueta 3D clara, como los dashboards de logística). Se juega gratis en el navegador, en la compu
o en el celular, en **/cargo/** del mismo sitio (por ejemplo `riftfall.duckdns.org/cargo/`).

## Cómo se juega

- **Pedidos**: un planeta pide toneladas de una carga. Si tenés stock en el depósito, los drones cargan la
  nave en el muelle, la nave viaja y cobra al entregar (el combustible se descuenta del pago). Si llega tarde
  cobra la mitad.
- **Fletes**: llevar carga de un planeta a otro. No necesitan stock: sirven para empezar sin plata.
- **Mercado**: comprar carga en los planetas productores para tener stock (Kepa vende agua, Ferra mineral,
  Vesta alimentos, Nimbus combustible y Forja piezas). Los precios suben y bajan.
- **Los planetas giran**: las distancias cambian todo el tiempo. Un viaje corto gasta menos y llega antes.
  Cruzar el cinturón de asteroides sin escudos cuesta el doble de tiempo.
- **Mejoras**: muelles (más naves cargando a la vez), drones (carga más rápida), depósito (más stock),
  hangar (más naves), motores, escudos y piloto automático.
- **Piloto automático**: cada nave puede reponer stock, cumplir pedidos o hacer fletes sola. Al volver al
  juego se simula lo que pasó mientras no estabas (hasta 2 horas).
- **Niveles**: cada entrega da reputación. Los niveles habilitan planetas (Nimbus en el 3, Forja en el 5),
  naves (Mula en el 2, Titán en el 4) y mejoras.

## Cómo está hecho

| Parte | Archivos |
|---|---|
| Simulación (sin dibujo, se guarda en JSON) | `src/cargo/sim/` (`data.js`, `orbit.js`, `sim.js`) |
| Escena 3D de la estación | `src/cargo/render/stationScene.js` (fijo) y `station.js` (naves, drones, estanterías) |
| Mapa del sistema | `src/cargo/render/map.js`, `planets.js` (texturas generadas por código) |
| Modelos (naves, drones, contenedores) | `src/cargo/render/models.js`, `kit.js` |
| Interfaz y textos | `src/cargo/ui/ui.js`, `src/cargo/i18n.js` (castellano, inglés, portugués) |
| Taller de estilo (estéticos pagados) | `src/shared/cargo-style.js` (catálogo y verificación), `src/cargo/style.js` (wallet y compra) |
| Pruebas | `test/unit/cargo.test.mjs`, `test/unit/cargo-style.test.mjs`, `test/e2e/cargo.spec.js` |

Gráficos con Three.js, oclusión ambiental (N8AO) y sombras suaves. La calidad baja sola si el equipo no
llega a ~40 cuadros por segundo (se puede forzar con `?q=low` o `?q=high`).

## Taller de estilo (estéticos pagados)

Pinturas para las naves, color de la estela de los motores, matrícula con el nombre que quieras y el
nombre de tu empresa en el cartel de la estación. Se prueban gratis en la vista previa y se pagan en
USDT o BNB (red principal de BNB Chain) directo a la wallet del creador. Solo cambian cómo se ve el juego.

| Artículo | Precio |
|---|---:|
| Pintura Carbono, Aurora o Solar | US$ 2 c/u |
| Estela magenta, verde, violeta o dorada | US$ 1 c/u |
| Matrícula propia (nombre en cada nave) | US$ 1 |
| Cartel propio de la estación | US$ 2 |
| Pack Rift completo (todo lo anterior; suelto suma US$ 13) | US$ 7 |

- Cada pago lleva en la transacción la etiqueta del artículo (`RCS:liv-aurora`): el juego la lee en la
  cadena, así un pago vale para una sola cosa y no sirve como Pase Fundador (ni al revés).
- **Otro dispositivo:** se pega el hash del pago y se recupera la compra.
- **Celular sin wallet:** pagar abre la app de MetaMask llevando la partida y las compras en el link.
- **Pase Fundador de RIFTFALL:** Piloto regala la matrícula propia; Oro, además, la pintura Dorado Fundador
  y la estela dorada y el plano del Vencejo; Leyenda, además, la pintura Prisma y el plano del Halcón Rift.
- Se ven solo en tu juego. Más adelante, con un servidor, los demás jugadores podrían ver tu flota en un ranking.

## Universo: tres sistemas estelares

- **Rift** (estrella dorada, el de la estación), **Umbra** (enana roja, nivel 6: Cripta, Brasa y Eco) y
  **Helios** (gigante azul, nivel 9: Áurea, Cielo y Edén). Cada sistema tiene su portal de salto.
- Para ir a otro sistema, la nave vuela al portal de su sistema, salta (8 segundos y algo de combustible) y sale
  por el portal del otro lado. Los pedidos lejanos pagan más. El cinturón de asteroides queda entre la estación y
  el Portal Rift: los escudos o una nave blindada ahorran tiempo.
- En el mapa, la botonera de arriba lleva a cada sistema o a la vista de todo el universo.
- Código: `src/cargo/sim/data.js` (SYSTEMS, PORTS con `sys`, JUMP), `viaGates()` en `src/cargo/sim/sim.js` y el mapa en
  `src/cargo/render/map.js`.

## Naves: Hangar Rift y evolución

- **9 naves de diseño exclusivo**, 3 por clase: liviana (Vencejo veloz, Libélula económica, Halcón Rift blindado),
  mediana (Raya, Nómada, Bisonte) y pesada (Nova, Leviatán, Coloso). Cargan lo mismo que la de fábrica de su clase
  y no son más fuertes: cambian el equilibrio entre velocidad y combustible, y las blindadas cruzan el cinturón sin frenar.
- Se compra el **plano** una vez (US$3 / 5 / 8, o la Flota Rift con los 9 por US$29; pago verificado como los
  estéticos) y después se construyen con créditos. Diseños 3D en `src/cargo/render/exclusive.js`.
- **Evolución Mk II y Mk III** de cualquier nave con créditos (nivel 3 y 6): +8% / +16% de velocidad y −8% / −16% de
  combustible. Se ve en la nave: góndolas de impulso (Mk II) y halo encendido (Mk III).

## Ruta Rift (los dos juegos se premian entre sí)

- Jugar RIFTFALL da créditos acá: primera partida $2.500, primer nivel del Rift $10.000, primera victoria $25.000.
- Crecer acá da Núcleos en RIFTFALL: nivel 3, 6 y 9 (300, 800 y 1.500).
- Cada escalón se cobra una vez. Código: `src/rift/bridge.js`.

## Próximos pasos

1. Más contenido: eventos (tormentas solares, piratas), contratos fijos de largo plazo, logros.
2. Versión para portales (CrazyGames, Poki, itch.io) con anuncios con premio ("duplicá esta carga").
3. Etapas 2 y 3 de la economía (naves NFT con mejoras grabadas y Contratos Rift en $RIFT): ver
   [`RIFT-CARGO-ECONOMIA.md`](RIFT-CARGO-ECONOMIA.md).
