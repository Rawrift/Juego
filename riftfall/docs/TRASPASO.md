# Traspaso y acuerdo de trabajo (7 de octubre de 2026)

Documento para quien tome el proyecto (Claude, Codex u otra persona). Resume cómo se trabaja, qué se acordó
y qué sigue. Lo de fondo de cada tema está en los demás archivos de `docs/`.

## Quién hace qué

| Quién | Rol |
|---|---|
| Rodrigo (dueño) | Decide. Autorizó trabajar en todo lo necesario **menos gastar plata**. Hace lo que nadie más puede: cuentas, formularios, firmas de wallet |
| Claude | Dirección del producto y revisión de cada cambio antes de fusionar |
| Codex | Implementación y pruebas en una rama propia |

- Si Claude no está disponible, Codex toma la dirección hasta que vuelva.
- Publicar en el juego en vivo se avisa antes a Rodrigo cuando el cambio lo afecta (por ejemplo, cerrar sesiones).
- Las claves nunca van al chat ni al repositorio.

## Acuerdos de producto que no se tocan

- Gráficos, sonido e identidad actuales (oscuro + neón, Orbitron y Rajdhani; todo generado por código).
- Se juega gratis y sin wallet. Los estéticos no dan ventaja.
- Sin preventa, sin promesas de ganancia, sin cajas sorpresa pagas.
- Castellano, inglés y portugués.
- Costo cero: planes gratis de Cloudflare y Vercel, y la dirección `riftfall.duckdns.org` (las passkeys están atadas a ella).

## Estado medido el 7/10 a las 18:15 (hora de Argentina)

| | |
|---|---|
| Cuentas creadas | 139 (130 el 6/10, 9 el 7/10) |
| Se quedaron más de un minuto | 58 |
| Volvieron otro día | 0 |
| Partidas guardadas de Rift Cargo | 2 |
| Partidas en el ranking | 2, de 1 jugador |
| Compras | 0 |
| Última cuenta nueva | 7/10 a las 05:23 |
| Última visita con sesión | 7/10 a las 12:27 |

- La tabla de orígenes (de dónde llega cada jugador) está vacía: solo se llena con cuentas nuevas y no hubo
  ninguna desde que se agregó.
- La dirección del juego respondió bien 7 de 9 veces desde el entorno de Claude; las otras 2 no contestaron en
  12 segundos. No está confirmado que le pase a los jugadores.
- Pruebas unitarias: 79 de 79. Compilación: bien. Contratos y pruebas de navegador: sin correr en esta sesión.

## Hallazgos de seguridad (revisados sobre `dd1a617`)

| Hallazgo | Dónde | Bloque |
|---|---|---|
| El link para abrir el juego en MetaMask lleva la sesión en la URL: quien lo abre queda logueado | `src/client/transfer.js` (`metamaskLink`), `src/rift/move.js`, `src/cargo/style.js` (`CARRY`) | 1 |
| Los pagos en BNB se valúan con la cotización del momento de verificar, no con la del pago | `cloud/chain.mjs`, `src/shared/founder.js` | 1 |
| El guardado acepta cualquier dato y los derechos (Pase, estéticos) se leen del navegador | `cloud/api.mjs`, `src/client/founder.js`, `src/cargo/style.js` | 2 |
| El control rápido del ranking acepta el resumen que manda el jugador; la auditoría es manual | `cloud/quick-verify.mjs`, `scripts/audit-runs.mjs` | 2 |

## Plan acordado

**Bloque 1 (autorizado): sesiones seguras y compras en BNB reproducibles.**

- Sacar la sesión de todo enlace; usar un código de un solo uso con vencimiento corto.
- Guardar cada pedido de compra con importe en wei, artículo, red y vencimiento, y conservar el derecho
  reconocido para restaurarlo sin volver a cotizar.
- Caducar las sesiones emitidas antes del cambio (Rodrigo tendrá que volver a entrar en sus dispositivos).
- Camino manual para pagos sin pedido previo: el dueño reconoce el derecho desde su panel y queda registrado.
- Límite de pedidos por cuenta, para no agotar las escrituras del plan gratis.

**Bloque 2: derechos en el servidor y ranking verificado**, antes de cualquier premio con valor transferible.

**El token en la red principal** espera a los dos bloques y a que haya financiación externa efectiva.

## Lo que trae ingresos

Hoy el juego puede cobrar y no tiene quién le compre. La seguridad evita pérdidas, pero las ventas dependen de
que lleguen jugadores. En orden de rapidez:

1. Cafecito (cobro en pesos con Mercado Pago): Rodrigo crea la cuenta y pasa el link; se agrega el botón en los dos juegos.
2. Videos ya hechos en TikTok y Reels desde una cuenta del juego (`PLAN-HOY.md`).
3. itch.io con donaciones (`ITCH.md`) y CrazyGames con publicidad (`FINANCIAMIENTO.md`).
