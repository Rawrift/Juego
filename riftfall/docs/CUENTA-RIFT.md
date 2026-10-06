# Cuenta Rift y servidor en Cloudflare

> Una sola cuenta para todo el universo Rift (RIFTFALL y Rift Cargo). El progreso, los puntajes, el
> nombre y las compras quedan guardados en la nube y se ven igual en cualquier dispositivo.

## Decisiones tomadas

| Tema | Decisión |
|---|---|
| Universo | **Un universo Rift con dos juegos.** Una cuenta, un token, un Pase Fundador, una wallet. Cada juego mantiene su moneda gratis (Núcleos en RIFTFALL, créditos en Cargo). Lo que se compra con token o plata sirve en los dos. |
| Estética | **Misma familia visual:** la cuenta, la tienda y los menús comparten la identidad Rift (oscuro + neón, Orbitron, el cubo). Cada juego conserva su estilo de juego (2D arcade y 3D isométrico). |
| Login | **Wallet** (firmar un mensaje: gratis, no autoriza pagos) o **huella / Face ID** (passkey). Sin contraseñas. Al entrar por primera vez se crea un invitado al instante. |
| Pagos | **Solo con wallet por ahora** (USDT o BNB a la wallet del creador). Todo el juego se puede jugar gratis. Mercado Pago, más adelante. |
| Servidor | **Cloudflare Pages + D1, plan gratis.** Permite vender (el plan gratis de Vercel no) y la base de datos alcanza para miles de jugadores. |

## Cómo funciona

- **Primera visita:** se crea una cuenta de invitado y el progreso ya se guarda en la nube. Se conserva el
  id que el navegador tenía en el ranking, así no se pierden las filas de antes.
- **Proteger la cuenta:** con la huella o Face ID del dispositivo (passkey) o con la wallet. La passkey
  se sincroniza sola con la cuenta de Google o de Apple del jugador, así entra desde otro celular.
- **Entrar desde otro dispositivo:** "Entrar con huella o Face ID" o "Conectar wallet". La página se
  recarga con el progreso de la cuenta (si el dispositivo tenía progreso de invitado, se mezcla sin
  perder nada).
- **Progreso:** RIFTFALL sube su progreso unos segundos después de cada cambio; Rift Cargo, cada minuto y
  al cerrar o esconder la página. Si otro dispositivo guardó antes, RIFTFALL mezcla (lo mejor de cada
  lado) y Cargo se queda con la partida que más ganó.
- **Rankings:** con sesión, la partida se anota en la cuenta (nombre y fila iguales en todos lados).
- **Compras:** el Pase Fundador y los estéticos de Cargo se suman a la cuenta. El servidor verifica el
  pago en BNB Chain y pide que la wallet que pagó esté en la cuenta (así nadie puede adueñarse de un pago
  copiando el hash de BscScan). En otro dispositivo, al entrar, aparecen solas.
- **El día del ranking "Hoy" y del Desafío** cambia a las 00:00 de Argentina (antes era a las 21:00).
- **Sin servidor** (por ejemplo, la versión para portales o un sitio sin la nube) el juego funciona igual
  con lo guardado en el dispositivo, y el botón de la cuenta no aparece.

## Archivos

| Parte | Archivo |
|---|---|
| Servidor (cuentas, progreso, compras, rankings) | `cloud/api.mjs` |
| Base de datos (tablas, consultas) | `cloud/store.mjs` |
| Verificación de pagos en BNB Chain | `cloud/chain.mjs` |
| Control rápido de partidas | `cloud/quick-verify.mjs` |
| Entrada de Cloudflare Pages | `functions/api/[[path]].js` |
| Cliente de la cuenta (los dos juegos) | `src/rift/account.js` |
| Ventana "Cuenta Rift" | `src/rift/account-ui.js`, `src/rift/account.css` |
| Mudanza desde la dirección vieja | `src/rift/move.js` |
| Pruebas | `test/unit/cloud.test.mjs`, `test/e2e/account.spec.js` |

## Límites del plan gratis de Cloudflare y cómo se resolvieron

- **10 ms de procesador por pedido.** Volver a jugar una partida para verificarla tarda de 30 a 600 ms,
  así que el ranking hace un **control rápido** (que la grabación sea válida y que el puntaje sea posible
  para lo que duró) y guarda la partida completa. Después, `scripts/audit-runs.mjs` las vuelve a jugar y
  saca del ranking las que no coinciden:

  ```bash
  AUDIT_TOKEN=<la clave> node scripts/audit-runs.mjs https://riftfall.pages.dev
  ```

  La clave se configura en Cloudflare (Pages → Settings → Variables → `AUDIT_TOKEN`, como secreto).
  Con el plan pago de Workers (US$5/mes) se puede poner `FULL_VERIFY=1` y verificar cada partida al
  recibirla.
- **Firma de la wallet:** la primera verificación arma unas tablas de la curva (~50 ms); se hace al
  arrancar el servidor, no en el primer pedido.
- **Base D1 gratis:** 5 GB, 5 millones de lecturas y 100.000 escrituras por día.

## Dónde está publicado

- **Sitio:** https://riftgames.pages.dev (RIFTFALL en `/`, Rift Cargo en `/cargo/`).
- **Cloudflare:** proyecto Pages `riftgames` y base D1 `rift` (región este de EE. UU.), en la cuenta del dueño.
- **Dirección vieja:** riftfall-chi.vercel.app y riftfall.duckdns.org mandan a la nueva con todo lo que el
  jugador tenía guardado en ese navegador (`src/rift/move.js`). Los rankings de Vercel se copiaron a D1.

## Publicar una versión nueva

El proyecto se publica subiendo la carpeta compilada (no está conectado a GitHub). Desde `riftfall/`:

```bash
npx wrangler login --device        # el dueño abre el link y toca "Autorizar" (no comparte contraseñas)
npm run build
npx wrangler pages deploy --project-name riftgames --branch main
npx wrangler logout                # al terminar, se cierra el acceso
```

`wrangler.toml` enlaza la base D1 como `DB`. Para consultar la base:
`npx wrangler d1 execute rift --remote --command "SELECT COUNT(*) FROM players"`.

Si más adelante se prefiere que cada push publique solo, hay que crear en el panel de Cloudflare un
proyecto Pages conectado al repositorio (Workers & Pages → Create → Pages → Connect to Git) con la carpeta
raíz `riftfall`, el comando `npm run build` y la salida `dist`.
