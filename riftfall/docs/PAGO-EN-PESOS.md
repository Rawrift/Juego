# Pago en pesos

Para quien no tiene wallet cripto. El jugador paga por fuera del juego (link de cobro o alias del dueño) y
el dueño reconoce el pago a mano desde su panel, con una firma. **Sin configuración completa, esta forma de
pago no existe: no aparece ningún botón.**

## Cómo se prende (lo hace el dueño, en Cloudflare → Pages → Settings → Variables)

| Variable | Qué va |
|---|---|
| `FIAT_PAY_URL` | Link de cobro. Solo se acepta `https` y solo de `cafecito.app`, `mpago.la` o `link.mercadopago.com.ar` |
| `FIAT_ALIAS` y `FIAT_HOLDER` | Alternativa al link: alias y titular (van los dos o ninguno) |
| `FIAT_PRICES` | Precios en pesos enteros, por artículo: `{"founder:pilot": 4500, "style:trail-magenta": 1500}` |

- Los precios los fija el dueño, uno por uno. El juego **no convierte** desde dólares con ninguna cotización.
- Solo se vende lo que tenga precio cargado. Lo que esté mal escrito se ignora.
- Para apagarlo: borrar `FIAT_PRICES` o el destino de cobro.

## Qué se puede vender así

Lista cerrada en `src/shared/fiat.js`: el **Pase Fundador Piloto** y los **estéticos de Rift Cargo** (pinturas,
estelas, matrícula, cartel y el pack de estilo). No se venden en pesos los planos de naves, la Flota Rift, ni
los Pases Oro y Leyenda (traen planos de naves, y el Leyenda promete una nave NFT).

## Qué ve el jugador

1. Botón **Pagar en pesos · $ 4.500** junto a los de USDT y BNB (Pase Fundador en RIFTFALL; Taller de estilo en Cargo).
2. Si es invitado, primero protege la cuenta con huella, Face ID o wallet: la compra queda en la cuenta.
3. Ve el importe, a dónde pagar y su código (`RIFT-XXXXX-XXXXX`), que escribe en el mensaje del pago.
4. Queda **"Pago en revisión"**. No recibe nada hasta que el dueño reconoce el pago.
5. Con la ventana abierta, el juego pregunta cada 8 segundos: cuando se acredita, la ventana pasa a "Pago
   acreditado", deja de ofrecer pagar o cancelar y la compra se aplica en ese momento. Si la cerró, la compra
   aparece la próxima vez que entre, en cualquiera de sus dispositivos.
6. Volver a tocar el botón muestra el mismo pedido (no arma otro). Si venció, avisa que **no vuelva a pagar**:
   un pago ya hecho se acredita igual.
7. Cancelar pide confirmación y avisa que es solo para quien no envió plata: cancelar no devuelve ni acredita
   ningún pago.

## Pedidos ya hechos cuando el cobro se apaga o cambia

- El jugador los reabre desde **Cuenta Rift → Mis pagos en pesos** (aparece solo si tiene pedidos). Ve su
  código, su importe y el destino que tenía ese pedido. Desde ahí no se arman pedidos nuevos.
- Un pedido vencido se ve sin destino ni instrucciones, con el aviso de no volver a pagar.
- El dueño conserva la entrada **Pagos en pesos** de su panel mientras queden pedidos por reconocer.
- El botón de compra desaparece apenas el dueño apaga el cobro (la configuración no se guarda en caché).

## Qué hace el dueño

Cuenta Rift → Panel del dueño → **Pagos en pesos**. Busca el código que vino en el mensaje del pago, carga el
importe cobrado, la referencia (el número de operación de su app de cobros) y dónde vio el pago, y firma con
su wallet. La firma es gratis y no mueve fondos: solo registra el derecho.

## Reglas

| Regla | Valor |
|---|---|
| Código del pedido | Al azar (50 bits), lo genera el servidor |
| Importe y artículo | Los fija el servidor al crear el pedido; el jugador no elige ninguno |
| Destino del cobro | Queda fijado en el pedido. Si el dueño cambia después el link, el alias o el precio, los pedidos ya hechos conservan los suyos |
| Pedidos abiertos por artículo | Uno solo por cuenta, aunque haya vencido (puede estar pagado y esperando al dueño) |
| Pedidos por cuenta | 3 pendientes a la vez y 10 por día |
| Vencimiento | 72 horas para el jugador; el dueño puede reconocer un pago tardío hasta 30 días |
| Importe al reconocer | Tiene que ser exactamente el del pedido |
| Referencia del cobro | Única: un mismo cobro no se puede atribuir a dos pedidos |
| Un pedido | Se acredita una sola vez, aunque lleguen dos reconocimientos a la vez |
| Firma | De una wallet del dueño que esté en la cuenta que reconoce; dice sitio, pedido, artículo, importe, referencia y motivo, y vale 2 minutos y una sola vez |
| Quien ya tiene el artículo | No puede volver a pedirlo |

## Qué se guarda

- `fiat_orders`: el pedido (código, cuenta, artículo, pesos, estado).
- `fiat_reviews`: quién reconoció, con qué wallet, cuánto, la referencia y el motivo.
- `purchases`: la compra, con `tx = fiat:<pedido>`, `method = ars-manual` y `usd` vacío (no se inventa una conversión).

No se guarda nada del comprador fuera de su cuenta del juego: ni nombre, ni comprobante, ni captura. En el
motivo no hay que escribir datos de la persona. El panel del dueño no muestra de qué cuenta es cada pedido.

## Reconciliar

- Pedidos sin reconocer: Panel del dueño → Pagos en pesos (los vencidos figuran como "vencido").
- Pagos reconocidos: `SELECT order_id, payment_ref, ars, reason, at FROM fiat_reviews ORDER BY at DESC`.
- Si llega un pago sin código o con otro importe, no se puede acreditar desde el panel. Qué hacer con esa
  plata lo resuelve el dueño con la persona, por fuera del juego: el juego no devuelve pagos.
- Un pedido cancelado no se puede reconocer. Si alguien canceló después de pagar, se arregla por fuera.
- Un reconocimiento hecho por error no se deshace desde el panel; hay que corregirlo en la base y dejar nota.

## Límites conocidos

- Es manual: mientras el dueño no mire el panel, el jugador espera. Sirve para pocas ventas.
- El juego no puede comprobar el pago: confía en lo que el dueño ve en su app de cobros y en su firma.
- Compradores distintos: se cuentan cuentas, no personas. Una persona puede tener dos cuentas.
- Cobrar en pesos por un objeto del juego es un ingreso del dueño; cómo declararlo lo ve con un contador.

Código: `src/shared/fiat.js`, `cloud/api.mjs` (rutas `/api/rift/fiat/*`), `cloud/store.mjs`, `src/rift/fiat-ui.js`.
Pruebas: `test/unit/fiat.test.mjs` y dos casos en `test/e2e/account.spec.js`.
