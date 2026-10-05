# Proyección económica de RIFTFALL (24 meses)

> Generado con `npm run economy -- --md`. Es un **modelo de planificación**: los resultados dependen por completo de los supuestos (adquisición de jugadores, conversión a pago y precio de $RIFT). No es una promesa de ingresos. Recalibra con datos reales a las 4–8 semanas del lanzamiento.

## Supuestos por escenario

| | Conservador | Base | Optimista |
|---|---:|---:|---:|
| Jugadores mensuales iniciales | 1000 | 4000 | 10.000 |
| Crecimiento mensual inicial | 12% | 22% | 30% |
| Techo de jugadores mensuales | 20.000 | 100.000 | 300.000 |
| Nuevos jugadores que compran nave | 2.0% | 3.0% | 4.5% |
| Jugadores con wallet que canjean | 25% | 35% | 45% |
| Jugadores diarios en la Arena | 4% | 6% | 9% |
| Precio supuesto de $RIFT | $0.001 | $0.004 | $0.008 |
| Precio supuesto de ETH | $2500 | $3000 | $3500 |

Comunes: 20% de jugadores diarios sobre mensuales, 380 Shards/día por jugador activo, nave media 0,0103 ETH, 1.200 RIFT/mes en Forja por poseedor, 6% de naves revendidas al mes a 4.000 RIFT, 60% de los RIFT canjeados se venden, el creador posee el 80% de la liquidez del pool. Infraestructura: $60/mes + $0,003 por jugador mensual.

## Resultado neto para el creador

| | Conservador | Base | Optimista |
|---|---:|---:|---:|
| **Año 1 (neto)** | **$6202** | **$91.626** | **$649.935** |
| **Año 2 (neto)** | **$19.209** | **$391.260** | **$2.867.005** |
| Venta de naves NFT (ETH) (24 m) | $24.742 | $373.115 | $2.285.993 |
| Forja (30% a tesorería) (24 m) | $1972 | $94.285 | $1.025.145 |
| Rake de Arena (10%) (24 m) | $222 | $12.719 | $150.950 |
| Comisión del Mercado (5%) (24 m) | $66 | $3143 | $34.171 |
| Regalías ERC-2981 externas (24 m) | $33 | $1571 | $17.086 |
| Comisiones de liquidez (DEX) (24 m) | $94 | $2142 | $15.517 |

No incluye el valor del 15% del equipo (vesting) ni del 20% de tesorería: venderlos en el mercado mueve el precio, así que se tratan como reserva y no como ingreso.

## Salud del token

| | Conservador | Base | Optimista |
|---|---:|---:|---:|
| RIFT emitidos a jugadores (24 m) | 50,0 M | 180,1 M | 277,8 M |
| RIFT quemados (24 m) | 2,7 M | 33,0 M | 180,3 M |
| RIFT que quedan en el vault | 352,0 M | 244,4 M | 256,0 M |
| Ratio medio compra/venta de jugadores | 0,28 | 1,61 | 8,67 |

Un ratio compra/venta por debajo de 1 significa que los jugadores venden más RIFT de los que compran para gastar: presión bajista sobre el precio. Las palancas para corregirlo están en `docs/ECONOMIA.md` (sección 8).

### Detalle mensual · conservador

| Mes | Jugadores/mes | Compradores | RIFT emitidos | RIFT quemados | Compra/venta | Bruto | Neto |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 1000 | 24 | 0,6 M | 0,0 M | 0,16 | $630 | $567 |
| 2 | 1114 | 12 | 0,6 M | 0,0 M | 0,18 | $319 | $255 |
| 3 | 1240 | 13 | 0,7 M | 0,0 M | 0,20 | $357 | $293 |
| 4 | 1380 | 15 | 0,8 M | 0,0 M | 0,22 | $399 | $335 |
| 5 | 1534 | 16 | 0,9 M | 0,0 M | 0,23 | $446 | $381 |
| 6 | 1704 | 18 | 1,0 M | 0,0 M | 0,24 | $496 | $431 |
| 7 | 1891 | 20 | 1,1 M | 0,0 M | 0,25 | $552 | $486 |
| 8 | 2096 | 22 | 1,2 M | 0,1 M | 0,26 | $613 | $547 |
| 9 | 2322 | 24 | 1,3 M | 0,1 M | 0,27 | $680 | $613 |
| 10 | 2568 | 27 | 1,5 M | 0,1 M | 0,27 | $752 | $684 |
| 11 | 2837 | 30 | 1,6 M | 0,1 M | 0,28 | $831 | $762 |
| 12 | 3129 | 33 | 1,8 M | 0,1 M | 0,28 | $916 | $847 |
| 13 | 3445 | 36 | 2,0 M | 0,1 M | 0,29 | $1008 | $938 |
| 14 | 3788 | 39 | 2,2 M | 0,1 M | 0,29 | $1107 | $1036 |
| 15 | 4156 | 43 | 2,4 M | 0,1 M | 0,29 | $1214 | $1141 |
| 16 | 4551 | 47 | 2,6 M | 0,1 M | 0,30 | $1327 | $1253 |
| 17 | 4973 | 51 | 2,8 M | 0,2 M | 0,30 | $1448 | $1373 |
| 18 | 5421 | 56 | 3,1 M | 0,2 M | 0,30 | $1575 | $1499 |
| 19 | 5896 | 60 | 3,4 M | 0,2 M | 0,30 | $1709 | $1632 |
| 20 | 6394 | 65 | 3,6 M | 0,2 M | 0,31 | $1850 | $1770 |
| 21 | 6916 | 70 | 3,8 M | 0,2 M | 0,32 | $1995 | $1915 |
| 22 | 7459 | 75 | 3,8 M | 0,2 M | 0,35 | $2146 | $2063 |
| 23 | 8021 | 81 | 3,8 M | 0,3 M | 0,38 | $2300 | $2216 |
| 24 | 8597 | 86 | 3,8 M | 0,3 M | 0,41 | $2458 | $2372 |

### Detalle mensual · base

| Mes | Jugadores/mes | Compradores | RIFT emitidos | RIFT quemados | Compra/venta | Bruto | Neto |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 4000 | 136 | 3,2 M | 0,1 M | 0,17 | $4487 | $4415 |
| 2 | 4845 | 75 | 3,9 M | 0,1 M | 0,18 | $2707 | $2633 |
| 3 | 5859 | 90 | 4,7 M | 0,1 M | 0,20 | $3318 | $3241 |
| 4 | 7072 | 109 | 5,6 M | 0,2 M | 0,21 | $4044 | $3962 |
| 5 | 8518 | 130 | 6,8 M | 0,2 M | 0,22 | $4902 | $4816 |
| 6 | 10.233 | 156 | 8,2 M | 0,3 M | 0,23 | $5913 | $5822 |
| 7 | 12.254 | 186 | 9,8 M | 0,4 M | 0,23 | $7096 | $6999 |
| 8 | 14.619 | 221 | 11,7 M | 0,5 M | 0,24 | $8471 | $8368 |
| 9 | 17.365 | 261 | 13,9 M | 0,5 M | 0,24 | $10.056 | $9943 |
| 10 | 20.522 | 307 | 15,0 M | 0,7 M | 0,27 | $11.853 | $11.731 |
| 11 | 24.110 | 358 | 15,0 M | 0,8 M | 0,32 | $13.868 | $13.736 |
| 12 | 28.136 | 414 | 15,0 M | 0,9 M | 0,37 | $16.104 | $15.960 |
| 13 | 32.584 | 475 | 7,5 M | 1,1 M | 0,87 | $18.501 | $18.343 |
| 14 | 37.417 | 539 | 7,5 M | 1,3 M | 1,02 | $21.113 | $20.941 |
| 15 | 42.568 | 605 | 7,5 M | 1,5 M | 1,17 | $23.856 | $23.668 |
| 16 | 47.947 | 672 | 7,5 M | 1,7 M | 1,34 | $26.671 | $26.467 |
| 17 | 53.438 | 738 | 7,5 M | 1,9 M | 1,51 | $29.494 | $29.274 |
| 18 | 58.912 | 801 | 7,5 M | 2,2 M | 1,70 | $32.260 | $32.024 |
| 19 | 64.237 | 859 | 3,8 M | 2,4 M | 3,77 | $34.886 | $34.634 |
| 20 | 69.291 | 911 | 3,8 M | 2,7 M | 4,14 | $37.365 | $37.097 |
| 21 | 73.972 | 956 | 3,8 M | 3,0 M | 4,52 | $39.641 | $39.359 |
| 22 | 78.208 | 995 | 3,8 M | 3,2 M | 4,88 | $41.696 | $41.401 |
| 23 | 81.957 | 1027 | 3,8 M | 3,5 M | 5,23 | $43.528 | $43.222 |
| 24 | 85.211 | 1053 | 3,8 M | 3,7 M | 5,56 | $45.146 | $44.831 |

### Detalle mensual · optimista

| Mes | Jugadores/mes | Compradores | RIFT emitidos | RIFT quemados | Compra/venta | Bruto | Neto |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 10.000 | 490 | 10,3 M | 0,3 M | 0,19 | $19.719 | $19.629 |
| 2 | 12.900 | 295 | 13,2 M | 0,4 M | 0,21 | $13.616 | $13.517 |
| 3 | 16.604 | 378 | 17,0 M | 0,6 M | 0,22 | $17.808 | $17.698 |
| 4 | 21.309 | 484 | 21,9 M | 0,8 M | 0,23 | $23.093 | $22.969 |
| 5 | 27.248 | 616 | 28,0 M | 1,0 M | 0,24 | $29.712 | $29.571 |
| 6 | 34.679 | 780 | 30,0 M | 1,3 M | 0,29 | $37.866 | $37.701 |
| 7 | 43.881 | 980 | 15,0 M | 1,7 M | 0,74 | $47.667 | $47.476 |
| 8 | 55.119 | 1220 | 15,0 M | 2,2 M | 0,94 | $59.722 | $59.497 |
| 9 | 68.617 | 1502 | 15,0 M | 2,8 M | 1,18 | $74.016 | $73.750 |
| 10 | 84.494 | 1824 | 15,0 M | 3,5 M | 1,48 | $90.570 | $90.256 |
| 11 | 102.703 | 2181 | 15,0 M | 4,4 M | 1,82 | $109.200 | $108.832 |
| 12 | 122.966 | 2559 | 15,0 M | 5,3 M | 2,20 | $129.467 | $129.038 |
| 13 | 144.735 | 2942 | 7,5 M | 6,4 M | 5,26 | $150.584 | $150.090 |
| 14 | 167.207 | 3308 | 7,5 M | 7,5 M | 6,19 | $171.831 | $171.269 |
| 15 | 189.411 | 3638 | 7,5 M | 8,8 M | 7,15 | $192.177 | $191.548 |
| 16 | 210.358 | 3915 | 7,5 M | 10,1 M | 8,12 | $210.818 | $210.127 |
| 17 | 229.215 | 4132 | 7,5 M | 11,3 M | 9,06 | $227.249 | $226.502 |
| 18 | 245.440 | 4291 | 7,5 M | 12,6 M | 9,96 | $241.319 | $240.522 |
| 19 | 258.831 | 4399 | 3,8 M | 13,8 M | 21,61 | $253.136 | $252.300 |
| 20 | 270.478 | 4518 | 3,8 M | 14,9 M | 23,22 | $265.061 | $264.190 |
| 21 | 282.650 | 4721 | 3,8 M | 16,1 M | 24,84 | $280.106 | $279.199 |
| 22 | 295.369 | 4934 | 3,8 M | 17,3 M | 26,49 | $295.579 | $294.633 |
| 23 | 300.000 | 4731 | 3,8 M | 18,2 M | 27,72 | $294.543 | $293.583 |
| 24 | 300.000 | 4575 | 3,8 M | 19,0 M | 28,67 | $294.002 | $293.042 |

