# La Fusión — Sistema de Gestión (prototipo técnico v0)

Este es el punto de partida del backend, siguiendo el modelo de datos y las decisiones
acordadas en `La_Fusion_Especificacion_v2.md`.

## Qué hay acá

```
backend/
  prisma/schema.prisma   → modelo de datos completo (locales, menú, mesas, pedidos, caja, etc.)
  prisma/seed.js          → datos de prueba (local, menú, productos, mesas)
  src/index.js            → API: menú, mesas, pedidos (con modificadores), caja, pagos, comprobante
  package.json            → dependencias (Express, Prisma, Socket.io)
  .env.example             → variables de entorno necesarias
frontend/
  src/App.jsx              → pantallas: tipo de orden → mesa (si aplica) → menú → comandar
  src/api.js                → todas las llamadas al backend
  .env.example               → URL del backend + ID del local de prueba
```

No incluye todavía: impresión ESC/POS, bot de WhatsApp, facturación DGI.
Se van agregando en las próximas iteraciones.

## Cómo levantar el backend

1. `cd backend && npm install`
2. Crear una base Postgres (local o en la nube) y copiar `.env.example` a `.env` con la URL real.
3. `npm run prisma:migrate` — crea las tablas a partir del schema.
4. `npm run prisma:seed` — carga datos de prueba (un local, canales, comanderas, menú "Cena" con productos y modificadores, mesas). Al correrlo, va a imprimir en la consola el ID del local — copiarlo, se necesita para el frontend.
5. `npm run dev` — levanta la API en `http://localhost:4000`.

## Cómo levantar el frontend

1. `cd frontend && npm install`
2. Copiar `.env.example` a `.env`, y pegar en `VITE_LOCAL_ID` el ID que imprimió el seed del backend.
3. `npm run dev` — levanta la app en `http://localhost:5173`. Con el backend corriendo en paralelo, ya se puede armar un pedido de punta a punta.

## Endpoints de prueba

- `GET /api/menus/:localId` — devuelve el menú activo con categorías, productos y modificadores.
- `GET /api/mesas/:localId` — devuelve zonas y mesas.
- `POST /api/pedidos` — crea un pedido con sus ítems y modificadores elegidos, calcula el precio (respetando cupos gratis), emite evento en tiempo real.
- `PATCH /api/pedidos/:id/items/:itemId/estado` — cambia el estado de un ítem (pendiente/enviado/listo).
- `POST /api/cajas` — abre una caja (falla si ya hay una abierta en ese local).
- `GET /api/cajas/:localId/abierta` — devuelve la caja abierta del local, o `null`.
- `PATCH /api/cajas/:id/cerrar` — cierra la caja, calcula la diferencia contra lo esperado.
- `POST /api/cajas/:id/movimientos` — registra un retiro o gasto manual.
- `POST /api/pedidos/:id/pagos` — cobra un pedido (se puede llamar varias veces para dividir la cuenta).
- `POST /api/pedidos/:id/comprobante` — emite comprobante (fiscal o no fiscal) y cierra el pedido. Separado del cobro, como pide la especificación.

## Próximos pasos técnicos

1. Seed inicial: cargar un local, un menú, categorías y productos de prueba.
2. Frontend React: pantalla "Elegí un tipo de orden" → selección de productos → mandar a `/api/pedidos`.
3. Módulo de impresión: al crear un pedido, resolver qué impresoras imprimen qué (según `Canal` de cada producto y `copiaCompleta` de cada `Impresora`).
4. Servicio de WhatsApp (Baileys) como proceso aparte, hablando con esta misma API.

## Nota importante sobre continuidad de este proyecto

Este prototipo se armó dentro de una conversación de chat, en un entorno de trabajo que
se reinicia entre sesiones. Para el desarrollo real (con control de versiones, ejecución
continua, pruebas en los Sunmi, etc.) conviene mudar este código a un repositorio git y
seguir trabajando desde ahí — con Claude Code, que mantiene el proyecto completo entre
sesiones en vez de perderlo cada vez.
