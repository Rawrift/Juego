# Pedidos y recuperación de compras

El servidor crea un pedido antes de pedir la transferencia a la wallet. El pedido fija el artículo,
el pagador vinculado a la cuenta, BNB Chain, el importe exacto en unidades mínimas y un vencimiento
de 15 minutos. La etiqueta RPO identifica ese pedido en la transferencia; no se despliega ningún
contrato ni se pide una aprobación ERC20.

Para reconocer una compra se exige un comprobante exitoso, tres confirmaciones y que el bloque
siga siendo canónico. USDT exige además el evento Transfer del contrato correcto al destinatario
correcto. El pedido se consume en una operación transaccional: dos pagos por el mismo pedido no
dan dos derechos. Una compra ya reconocida se recupera sin consultar el precio de BNB nuevamente.

Los pedidos se limitan a 20 por día por cuenta o pagador, incluso cuando llegan peticiones simultáneas.
El cliente no puede elegir el precio ni el importe de un pedido.

## Compras anteriores y pagos tardíos

- Los pagos BNB sin pedido se valoran con el precio del bloque del pago. Si el proveedor no tiene
  ese dato histórico, se deriva a revisión, nunca al precio actual.
- Un pedido minado dentro del plazo puede reconocerse después del vencimiento sin revisión.
- Un pedido BNB o USDT minado tarde puede reconciliarse desde el panel del dueño: se comprueban
  sus datos originales y se conserva el artículo del pedido. No se puede sustituir por otro nivel.
- El pagador debe vincular su wallet a una cuenta. El dueño revisa el comprobante y el motivo,
  introduce el importe recibido en BNB o USDT y firma un mensaje específico que no mueve fondos.
- La decisión queda en purchase_reviews. La compra manual tiene usd NULL: reconocer un derecho
  no inventa una conversión a dólares. El pedido también se consume para evitar doble reconocimiento.

Las pruebas usan wallets y comprobantes simulados; no transfieren dinero. La base agrega tablas e
índices con CREATE IF NOT EXISTS, sin borrar compras, sesiones ni partidas existentes.

Este bloque conserva el juego gratuito, sus gráficos y su economía local. La autoridad de todos
los derechos y la verificación del ranking siguen siendo trabajo del siguiente bloque, antes de
cualquier premio transferible o lanzamiento del token.
