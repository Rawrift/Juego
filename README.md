# RIGYARD

Build PlayCanvas + Ammo verificada automáticamente.

## Windows

1. Extraé TODO el contenido del ZIP a una carpeta normal.
2. Hacé doble click en `ABRIR_RIGYARD.bat`.
3. Dejá abierta la ventana negra del servidor mientras jugás.
4. El navegador se abre solo cuando el servidor YA está escuchando.
5. Si el puerto 8765 está ocupado, el launcher elige automáticamente otro entre 8766 y 8785.

El servidor incluido usa .NET `TcpListener`: no necesita Python, Node, permisos de administrador ni reservas de URL de Windows.

## Verificación automática

Cada build debe pasar:

- instalación de dependencias,
- tests estáticos,
- Vite build,
- Chromium/Playwright E2E con WebGL,
- PlayCanvas + Ammo,
- movimiento del jugador,
- props,
- NPCs,
- tercera persona,
- smoke test del mismo `server.ps1` que se entrega para Windows.

Una build que no pasa estos gates no se empaqueta como verificada.


## Cinematic Industrial Visual Pass

The current build adds a deliberately authored visual layer without replacing the verified physics core:

- richer normal-mapped concrete, metal, grass, wood, tile and water,
- warm/cool industrial lighting and hero spotlights,
- hangar trusses, racks, ducts and work lights,
- tower glazing and interior glow,
- service tunnel utilities,
- puddles, drains, signage and loading dock details,
- skyline silhouettes and stacks,
- CC0 vegetation plus parked utility vehicles,
- subtle industrial ambient audio after user interaction,
- automatic Chromium screenshot artifact used as a visual regression checkpoint.
