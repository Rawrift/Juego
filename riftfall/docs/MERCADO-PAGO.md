# Cobro automático con Mercado Pago

Checkout Pro mediante Preferences API: el comprador completa el pago en Mercado Pago. El juego no pide ni guarda tarjetas. Se venden exclusivamente cosméticos de Cargo de la lista cerrada; no tokens, NFT, Founder ni planos de naves.

## Estado y activación

Implementación apagada por defecto. Las pruebas locales usan una API simulada y SQLite local: no representan una compra real ni una prueba en la plataforma de Mercado Pago. Antes de habilitar ventas, completar pruebas oficiales con la aplicación del titular y una base aislada. Los previews actuales de Pages comparten D1 con producción: no usarlos para compras de prueba.

Variables del servidor en Cloudflare Pages, separadas entre prueba y producción:

| Variable | Valor |
|---|---|
| `MP_ENABLED` | `true` únicamente al terminar la verificación del entorno |
| `MP_ACCESS_TOKEN` | Secret de la aplicación; nunca `VITE_*`, Git, chat ni archivo público |
| `MP_WEBHOOK_SECRET` | Secret generado al configurar Webhooks |
| `MP_COLLECTOR_ID` | ID numérico del vendedor, confirmado en la cuenta oficial |
| `MP_LIVE_MODE` | `false` para pruebas; `true` para ventas reales |
| `MP_SITE` | Origen HTTPS del juego, por defecto `https://riftfall.duckdns.org` |
| `MP_HOLDER` | Nombre público del responsable de la tienda |
| `MP_PRICES` | JSON de precios finales ARS enteros, por ejemplo `{"style:trail-magenta":1500,"style:liv-aurora":3000}` |

No hace falta Public Key en el navegador: se abre el `init_point` oficial devuelto por la API. Esta implementación utiliza Preferences, no mezcla sus IDs ni eventos con Orders API. Evaluar la migración recomendada por MP por separado.

Configurar la URL `https://riftfall.duckdns.org/api/rift/mp/webhook` con eventos **Pagos** y **Contracargos** de Preferences (`payment` y `topic_chargebacks_wh`). Mantener secrets y vendedor de los pedidos anteriores si se apagan nuevas ventas. No aceptar acuerdos de cuenta ni crear permisos nuevos en nombre del titular sin el paso correspondiente del titular.

## Entrega y recuperación

- Cuenta protegida obligatoria antes de crear un cobro. Precio, artículo, vendedor y modo quedan fijados en el pedido del servidor.
- El retorno del navegador nunca acredita. HMAC verifica el recurso notificado; luego el servidor consulta la API de MP y confirma referencia, vendedor, modo, moneda, importe y fechas.
- Solo `approved` sin devolución entrega. Notificaciones repetidas y concurrentes conservan un recibo por pago y un pago adjudicado por pedido.
- Un contracargo consulta el caso oficial y sus pagos; no confía en el `payment_id` del cuerpo. El estado del pago oficial decide el acceso.
- Reembolso total, parcial, cancelación o `charged_back` retiran el derecho en las próximas sincronizaciones, conservando el recibo de auditoría. Una respuesta antigua no reactiva el derecho. Esto no impide alterar un cliente offline; los cosméticos no generan activos transferibles ni recompensas monetarias.
- Historial privado y consulta de estado funcionan aunque se apaguen nuevas ventas. La ventana consulta cada 8 segundos, con un límite del servidor de 30 segundos por pedido. No hay reconciliador periódico independiente del jugador: mantener Webhooks activos y revisar excepciones.
- Un timeout al crear no repite el POST. Busca la preferencia por referencia para recuperar el enlace.

## Excepciones que requieren revisión operativa

Un segundo pago aprobado del mismo pedido se registra sin entregar otro derecho. Debe revisarse en Mercado Pago y decidir devolución; el juego no mueve dinero ni emite reembolsos automáticamente.

Un enlace vence a las 72 horas. El pedido se conserva y bloquea otra compra del mismo artículo para evitar duplicar pagos pendientes. Si la recuperación no encuentra preferencia o queda vencido sin pago, revisar el estado oficial antes de liberar un nuevo cobro. No hay panel automático para resolver estas excepciones en esta versión. No publicar el piloto hasta acordar cómo atenderlas.

Para inspección usar consultas de lectura sobre `mp_orders`, `mp_payments`, `mp_events` y recibos `purchases.method = 'ars-mp'`. No guardar respuestas completas de MP, datos del pagador ni credenciales en logs. `mp_payments.active = 1` distingue un derecho vigente de un recibo devuelto.

## Precios y piloto

Los valores 1500/3000 son precios finales provisionales. Consultar la comisión efectiva, impuestos/retenciones y plazo de disponibilidad de la cuenta del vendedor. Para una comisión proporcional total `c`, el precio para un neto objetivo `n` es `n / (1-c)`; cargos fijos se suman al numerador. No asumir una tasa promocional ni añadir un recargo sorpresa al comprador. Mostrar siempre el total antes de salir a MP.

Antes de activar: sandbox oficial aprobado/pendiente/rechazado, repetición de webhook, recuperación, devolución, contracargo, móvil y retorno del proxy; confirmar titular/vendedor y comisión. Medir cinco personas reales distintas con pagos vigentes, excluyendo dueño, pruebas y múltiples cuentas de la misma persona.

Apagar `MP_ENABLED` detiene nuevos pedidos. Mantener callbacks y consultas para pagos ya emitidos. Un rollback no borra las tablas ni los recibos.

Fuentes oficiales:
- https://www.mercadopago.com.ar/developers/es/reference/online-payments/checkout-pro-preferences/overview
- https://www.mercadopago.com.ar/developers/es/docs/checkout-pro-preferences/payment-notifications
- https://www.mercadopago.com.ar/developers/es/docs/checkout-pro-preferences/chargebacks/notifications
- https://www.mercadopago.com.ar/developers/es/docs/checkout-pro-preferences/integration-test/test-purchases
