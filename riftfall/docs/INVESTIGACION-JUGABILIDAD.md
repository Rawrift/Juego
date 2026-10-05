# Qué hace atractivo a un juego, qué juegos la pegan hoy y qué hacer con RIFTFALL

> Investigación de octubre de 2026. Complementa a [ANALISIS-MERCADO.md](ANALISIS-MERCADO.md), que trata la economía y el token.
> Este documento trata la **jugabilidad**: por qué la gente se engancha y por qué se aburre.

## 0. La conclusión en cinco líneas

1. **No conviene convertir RIFTFALL en un Axie.** El género de RIFTFALL (*survivor-like*: te movés, las armas disparan solas, elegís mejoras) es de lo que más factura hoy en celular y en PC. Axie, en cambio, pasó de 2,7 millones de jugadores diarios a menos de 10% de eso.
2. Lo que hay que copiar de Axie no es el combate por turnos, sino la **colección**: piezas que se combinan, equipos que se arman y temporadas competitivas. Eso se puede injertar en las naves de RIFTFALL, que ya se dibujan por piezas.
3. El problema que notaste es real y está medido. **Los primeros 5 minutos están equilibrados; a partir del minuto 6 el jugador se vuelve el doble de fuerte que la amenaza** y en los minutos 8–9 casi no recibe daño.
4. Además, **después del minuto 3:20 no aparece ningún enemigo nuevo**, así que el final de la partida es "más de lo mismo, pero más fácil".
5. Todos los juegos exitosos del género resuelven esto igual: **niveles de dificultad que se desbloquean ganando** (con más premio), **modo sin fin**, **enemigos nuevos hasta el final** y **metas a largo plazo** (colección, ranking, temporada).

## 1. Lo que medimos en RIFTFALL

Medimos 24 partidas del piloto automático con la nave gratis. "Poder ÷ amenaza" es el daño que hace el jugador por segundo dividido la vida enemiga que entra por segundo: 1 es parejo, 2 es que el jugador barre todo.

| Minuto | Siguen vivos | Poder ÷ amenaza | Vida media de un enemigo | Daño recibido por minuto | Nivel del jugador |
|---|---|---|---|---|---|
| 1 | 24/24 | 1,17 | 5,4 s | 0 | 5 |
| 3 | 24/24 | 1,07 | 4,2 s | 15 | 11 |
| 5 | 20/24 | 1,02 | 4,4 s | 23 | 15 |
| 6 | 14/24 | **1,79** | 3,7 s | 58 | 21 |
| 8 | 5/24 | **1,92** | 1,9 s | 22 | 46 |
| 9 | 5/24 | **2,00** | 1,9 s | **0** | 51 |
| 10 | 5/24 | **2,13** | 2,0 s | 37 | **62** |

**Qué dice la tabla:**

- **Hay una pared entre los minutos 4 y 7**: ahí muere la mayoría. Quien la pasa, normalmente es porque ya evolucionó armas.
- **Después de la pared, el juego se regala.** El daño del jugador crece 28 veces entre el minuto 5 y el 10, y la amenaza solo 13 veces.
  - Los enemigos tienen tope de 380 en pantalla y su vida crece en línea recta (`1 + t/95`).
  - El poder del jugador se multiplica: armas × niveles × pasivas × evoluciones.
- **Se sube de nivel demasiado rápido al final** (nivel 62 en el minuto 10), lo que alimenta la bola de nieve.
- **El contenido se termina temprano.** Hay 6 tipos de enemigo y el último aparece a los 3:20. Del minuto 5 al 10 solo hay 2 jefes y 1 enjambre como novedad.
- **No hay nada después de ganar**: ni un nivel más difícil, ni modo sin fin, ni algo que desbloquear.

## 2. Qué juegos la pegan hoy, y por qué

### Del mismo género que RIFTFALL (fuera de lo cripto)

| Juego | Números | Lo que lo hace funcionar |
|---|---|---|
| **Survivor.io** (Habby, celular) | Más de US$500 millones en compras dentro del juego; sigue facturando US$5–6 millones por mes tres años después | Se juega con un dedo y las armas disparan solas. Tiene progresión entre partidas (equipo, talentos), capítulos y eventos todo el tiempo |
| **Archero 2** (Habby, 2025) | US$27 millones por mes | **Capítulos**: hay que pasar todas las etapas de un tirón para abrir el siguiente, y cada capítulo trae enemigos nuevos. La pared es intencional y hay mecánicas para que el que va atrás alcance |
| **Capybara Go!** (Habby) | US$19 millones por mes | La misma fórmula, otra vuelta de tuerca |
| **Megabonk** (PC, 2025) | 1 millón de copias en 2 semanas y 102.000 jugadores a la vez | Lo visual y la música, mucho personaje para desbloquear y el empuje de los streamers |
| **Vampire Survivors** | El que inventó el género | Asume que el final es fácil y lo usa como fantasía de poder, pero suma la **Maldición**: el jugador elige hacer el juego más difícil a cambio de más oro y experiencia |
| **Brotato** | Un éxito independiente | **6 niveles de peligro**: ganar uno desbloquea el siguiente y un personaje nuevo. Cada nivel suma enemigos nuevos, oleadas de élite y +12% a +40% de vida y daño |

**La lección de Habby** (el estudio que mejor explota este género): "juego simple por arriba, retención y monetización por debajo". Su debilidad conocida es que la progresión de poder pelea con lo roguelike: primero el jugador se siente un dios y después choca contra una pared que lo invita a pagar. **Hay que evitar las dos puntas: ni regalarlo ni amurallarlo.**

### En cripto

| Juego | Estado | Por qué |
|---|---|---|
| **Axie Infinity** | Cayó de 2,7 millones de jugadores diarios (2021) a entre 88.000 y 225.000 según la fuente. Ingresó US$4 millones de tesorería en 2024. Prepara un MMO (Atia's Legacy) con 15 millones de pre-registros | Enganchaba por la **colección** (cada Axie tiene 6 partes de entre 200 posibles, y cada parte es una carta), por **armar equipo** y por **criar**. Se cayó por la economía (había que pagar para entrar y el token se infló sin techo), no por la colección |
| **Catizen** (Telegram) | 34 millones de usuarios, más de 1 millón que pagaron y unos US$27 por pagador | Juego de fusionar gatitos más compras dentro del juego. Su sub-juego **Bombie**, un shooter de zombies de acción simple, tuvo 770.000 jugadores diarios en 3 semanas y llegó a ser **casi la mitad de los ingresos** del centro de juegos |
| **Pixels** (Ronin) | Cerca de 1 millón de jugadores diarios y más de US$25 millones de ingresos. Retiene más del 40% al segundo mes | Granja social, premios dirigidos a quienes de verdad juegan y mide si gana más de lo que regala |
| **Hamster Kombat** | De 300 millones a ~27 millones | El "tocar para ganar" cansa. Sin un juego de verdad, la gente se va después del airdrop |
| **Pudgy Party** (Pudgy Penguins) | Cerró en 2026 después de 1 millón de descargas | Una marca fuerte no alcanza si la gente no vuelve |
| **opBNB** (red hermana de BNB) | Es la red con más jugadores de cripto. Arriba están The Landlord (~985.000 usuarios), SERAPH (~875.000) y World of Dypians (~600.000) | SERAPH es un juego de acción y botín (ARPG): otra vez acción simple con colección |

### Lo que se repite en todos los que funcionan

Según el modelo de Quantic Foundry, basado en 1,75 millones de jugadores encuestados, la gente juega por seis motivos: acción, maestría, logro, social, inmersión y creatividad. Los juegos que la pegan cubren varios a la vez:

| Motivo | Qué lo da | RIFTFALL hoy |
|---|---|---|
| **Acción y destrucción** | Hordas, explosiones, sensación de poder | ✅ Muy bien |
| **Desafío** (maestría) | Dificultad que acompaña al jugador | ❌ Se rompe después del minuto 6 |
| **Estrategia** (maestría) | Decisiones con peso: combos, sinergias, evoluciones | 🟡 6 armas y 11 pasivas: pocas combinaciones |
| **Colección y completar** (logro) | Desbloquear, juntar, "tengo que conseguir esa" | ❌ Solo 5 naves y nada más para juntar |
| **Poder** (logro) | Progreso que no se pierde | 🟡 Hay habilidades con Núcleos, pero son pocas |
| **Competencia** (social) | Rankings, torneos, temporadas | 🟡 El ranking y la Arena necesitan el servidor publicado |
| **Comunidad** (social) | Amigos, clanes, ayudarse | ❌ No hay |
| **Fantasía e historia** (inmersión) | Personajes con nombre y cara | ❌ No hay pilotos ni mascota |
| **Diseño y descubrimiento** (creatividad) | Personalizar, secretos | ❌ No se puede personalizar la nave |

## 3. ¿Convertirlo en algo tipo Axie?

**Respuesta corta: no cambiar el juego, sí sumarle lo mejor de Axie.**

**Por qué no cambiarlo por un combate por turnos:**

- El género de RIFTFALL factura muchísimo más que los juegos de cartas por turnos.
  - Habby solo: Survivor.io (más de US$500M acumulados), Archero 2 (US$27M por mes) y Capybara Go! (US$19M por mes).
  - La tesorería de Axie ingresó US$4M en todo 2024.
- Un juego por turnos se tendría que hacer desde cero: meses de trabajo para entrar a un nicho más chico, y además con fama de "juego para farmear".
- Lo que ya está hecho (acción fluida, anti-trampas por re-simulación, tienda, token) sirve tal cual.

**Lo que sí hay que tomar de Axie, sin sus errores:**

1. **Naves por piezas.** Cada nave se arma con alas, cañones, motores, cabina y aletas, y cada pieza da un efecto distinto: un disparo extra, un turbo, un escudo, más imán, etc.
   - El dibujo de las naves de RIFTFALL **ya está armado por piezas**, así que es una ampliación natural.
2. **Fusión (la "cría" de Axie).** Se combinan dos naves para sacar una nueva con piezas de ambas.
   - La fusión **consume** algo (RIFT o naves), así que funciona como sumidero.
   - Nunca debe ser la forma de "ganar plata": eso es lo que hundió a Axie.
3. **Hangar de colección.** Se ve qué piezas tenés y cuáles te faltan.
   - Las piezas raras salen jugando: un jefe en un nivel de dificultad alto, un desafío semanal.
   - También se pueden comprar como NFT, pero el NFT es opcional y no es *pay-to-win*: en la Arena todos juegan parejos.
4. **Temporadas competitivas** con ranking y premio.
5. **Pilotos con personalidad**: 3 o 4 personajes con nombre y cara. Son la mascota del juego y lo que la gente comparte.

## 4. Plan recomendado

### Fase 1: que no se ponga fácil (lo primero, porque es lo que sentiste)

1. **Curva de dificultad nueva.**
   - La vida y la cantidad de enemigos acompañan el poder del jugador de verdad (crecimiento exponencial al final, no en línea recta).
   - Menos experiencia al final, para cortar la bola de nieve.
   - **Meta: poder ÷ amenaza entre 1,0 y 1,3 durante los 10 minutos**, medido con la misma prueba de arriba.
2. **Enemigos y eventos nuevos hasta el final.**
   - 3 o 4 tipos nuevos entre los minutos 5 y 10: con escudo, que se teletransportan, kamikazes, que invocan.
   - Un evento cada minuto: grupos de élite, una zona que se achica, una lluvia de meteoritos.
   - Un **jefe final** en el minuto 10 que hay que matar para ganar.
3. **Niveles del Rift (1 a 10).**
   - Ganar uno desbloquea el siguiente. Cada nivel suma reglas (más vida, enemigos nuevos, élites más seguidos) y **más premio**.
   - Es lo que hacen Brotato, la Maldición de Vampire Survivors y el Heat de Hades.
   - Encaja con la economía: más dificultad da más Shards por habilidad, no por pagar.
4. **Modo sin fin** después de ganar, con ranking de cuánto aguantaste.

### Fase 2: colección tipo Axie, bien hecha

- Naves por piezas con efectos, fusión con sumidero, hangar de colección y pilotos.
- Diseñar la economía con la regla del análisis de mercado: **los premios nunca superan a los ingresos.**

### Fase 3: volver todos los días y traer amigos

- **Desafío diario**: la misma partida para todos (el juego ya es reproducible con una semilla) y un ranking del día.
- Instalar como app (PWA), referidos con premio y torneo semanal de Arena.

### Fase 4: distribución

- **CrazyGames** (~35 millones de usuarios por mes, pagan 60% de la publicidad) y **Poki** (~100 millones, pagan 50%).
  - Una versión sin cripto ahí trae jugadores e ingresos por publicidad desde el día uno, sin depender del token.
- **Telegram** como comunidad y Mini App. Las funciones cripto dentro de Telegram exigen TON, así que la tienda en BNB queda en la web.
- **DappBay** (el directorio de BNB Chain), DappRadar y Binance Web3 Wallet para el público cripto.

**Orden sugerido:** Fase 1 → desafío diario y PWA (de la Fase 3) → Fase 2 → resto de la Fase 3 → Fase 4.

## Fuentes

- Habby y el género: [Deconstructor of Fun: el imperio de Habby](https://www.deconstructoroffun.com/blog/2025/7/31/habbys-hybridcasual-empire-the-template-that-built-a-powerhouse) · [Naavik: Survivor.io](https://naavik.co/deep-dives/survivorio-archeros-footsteps/) · [Global Games Forum: Survivor.io, US$5M por mes](https://www.globalgamesforum.com/news/how-survivor.io-continues-to-pull-in-5-million-a-month-three-years-later) · [Game World Observer: Archero 2](https://gameworldobserver.com/2025/01/20/archero-2-revenue-8-million-in-11-days-vs-original-game) · [Game Developer: progresión de Archero](https://www.gamedeveloper.com/design/finding-the-fun-archero-part-2---progression)
- Megabonk: [Game World Observer: 1 millón de copias](https://gameworldobserver.com/2025/10/03/megabonk-is-a-new-indie-hit-on-steam-the-games-sales-have-surpassed-one-million-copies)
- Dificultad: [Vampire Survivors: la Maldición](https://rogueranker.com/?p=3436) · [Brotato Wiki: niveles de peligro](https://brotato.wiki.spellsandguns.com/Dangers)
- Motivaciones: [Quantic Foundry: modelo de motivación de jugadores](https://quanticfoundry.com/wp-content/uploads/2019/04/Gamer-Motivation-Model-Reference.pdf)
- Axie: [Prioridata: jugadores 2026](https://prioridata.com/data/axie-infinity-users/) · [Levex: ¿está muerto Axie?](https://levex.com/en/blog/is-axie-infinity-dead) · [BitPinas: mecánicas de Origins](https://bitpinas.com/learn-how-to-guides/axie-infinity-origin-gameplay-mechanics-guide/) · [Blog de Axie: Atia's Legacy](https://blog.axieinfinity.com/p/introducing-atias-legacy)
- Telegram: [The Block: Catizen](https://www.theblock.co/post/316195/catizen-completes-business-model-upgrade-pioneering-the-development-of-telegram-applications) · [CCN: ingresos de Catizen y Bombie](https://www.ccn.com/news/catizen-2024-revenues-airdrop-bombie/) · [Reown: mini apps 2026](https://reown.com/blog/top-telegram-mini-apps)
- Cripto en general: [DappRadar: juegos](https://dappradar.com/narratives/gaming/games) · [DappRadar: Q2 2025](https://dappradar.com/blog/state-of-blockchain-gaming-in-q2-2025) · [DappBay: ranking de juegos en BNB](https://dappbay.bnbchain.org/ranking/category/games) · [games.gg: cierre de Pudgy Party](https://games.gg/news/pudgy-party-shuts-down-2026/) · [Naavik: Pixels](https://naavik.co/digest/pixels-harvesting-web3/)
- Portales web: [Cinevva: publicar en CrazyGames](https://app.cinevva.com/guides/publish-game-crazygames) · [Cinevva: dónde publicar un juego web](https://app.cinevva.com/guides/publish-web-game)
