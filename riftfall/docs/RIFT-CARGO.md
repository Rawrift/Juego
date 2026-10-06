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
| Pruebas | `test/unit/cargo.test.mjs`, `test/e2e/cargo.spec.js` |

Gráficos con Three.js, oclusión ambiental (N8AO) y sombras suaves. La calidad baja sola si el equipo no
llega a ~40 cuadros por segundo (se puede forzar con `?q=low` o `?q=high`).

## Próximos pasos

1. Más contenido: eventos (tormentas solares, piratas), contratos fijos de largo plazo, logros.
2. Versión para portales (CrazyGames, Poki, itch.io) con anuncios con premio ("duplicá esta carga").
3. Conectar con la wallet: el Pase Fundador da una nave dorada exclusiva y un ranking de empresas.
