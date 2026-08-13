require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// ─── Menú ───────────────────────────────────
app.get('/api/menus/:localId', async (req, res) => {
  const menus = await prisma.menu.findMany({
    where: { localId: req.params.localId, activo: true },
    include: {
      categorias: {
        include: {
          productos: {
            include: { gruposModificadores: { include: { opciones: true } } },
          },
        },
      },
    },
  });
  res.json(menus);
});

// ─── Mesas ──────────────────────────────────
app.get('/api/mesas/:localId', async (req, res) => {
  const zonas = await prisma.zona.findMany({
    where: { localId: req.params.localId },
    include: { mesas: true },
  });
  res.json(zonas);
});

// ─── Pedidos ────────────────────────────────

// Dado un grupo de modificadores y las opciones elegidas dentro de ese grupo
// (ej. 4 "hots" elegidos en un grupo "3x2 hot" con cupo gratis = 3),
// calcula cuánto se cobra: las primeras `cantidadGratis` unidades (en el orden
// en que llegaron) no se cobran; el resto se cobra a su precioAdicional.
// Regla acordada: no importa cuál opción puntual queda "gratis", solo que
// el total de unidades que excede el cupo se cobre.
function calcularPrecioGrupo(grupoModificador, seleccionesDelGrupo) {
  let unidadesRestantesGratis = grupoModificador.cantidadGratis;
  let precioTotal = 0;

  for (const seleccion of seleccionesDelGrupo) {
    const opcion = grupoModificador.opciones.find((o) => o.id === seleccion.opcionModificadorId);
    for (let i = 0; i < seleccion.cantidad; i++) {
      if (unidadesRestantesGratis > 0) {
        unidadesRestantesGratis--;
      } else {
        precioTotal += Number(opcion.precioAdicional);
      }
    }
  }
  return precioTotal;
}

app.post('/api/pedidos', async (req, res) => {
  const { localId, tipo, mesaId, canalOrigen, mozoId, items } = req.body;
  // items esperado: [{ productoId, cantidad, modificadores: [{ opcionModificadorId, cantidad }] }]

  // Traemos todos los productos involucrados con sus grupos/opciones para
  // validar la selección y calcular precios antes de crear nada.
  const productoIds = items.map((it) => it.productoId);
  const productos = await prisma.producto.findMany({
    where: { id: { in: productoIds } },
    include: { gruposModificadores: { include: { opciones: true } } },
  });
  const productosPorId = Object.fromEntries(productos.map((p) => [p.id, p]));

  const itemsParaCrear = [];
  let totalPedido = 0;

  for (const it of items) {
    const producto = productosPorId[it.productoId];
    if (!producto) {
      return res.status(400).json({ error: `Producto ${it.productoId} no existe` });
    }

    const modificadores = it.modificadores || [];
    // Agrupamos las selecciones por grupoModificadorId para poder aplicar
    // el cupo gratis de cada grupo por separado.
    const seleccionesPorGrupo = {};
    for (const m of modificadores) {
      const opcion = producto.gruposModificadores
        .flatMap((g) => g.opciones.map((o) => ({ ...o, grupoId: g.id })))
        .find((o) => o.id === m.opcionModificadorId);
      if (!opcion) {
        return res.status(400).json({
          error: `La opción ${m.opcionModificadorId} no pertenece a ningún grupo de "${producto.nombre}"`,
        });
      }
      (seleccionesPorGrupo[opcion.grupoId] ||= []).push(m);
    }

    let precioModificadores = 0;
    for (const grupo of producto.gruposModificadores) {
      const seleccionesDelGrupo = seleccionesPorGrupo[grupo.id] || [];
      if (seleccionesDelGrupo.length === 0) continue;

      const totalUnidades = seleccionesDelGrupo.reduce((sum, s) => sum + s.cantidad, 0);
      if (grupo.seleccionMax && totalUnidades > grupo.seleccionMax) {
        return res.status(400).json({
          error: `"${grupo.nombre}" admite hasta ${grupo.seleccionMax} unidades, se pidieron ${totalUnidades}`,
        });
      }
      precioModificadores += calcularPrecioGrupo(grupo, seleccionesDelGrupo);
    }

    const precioItem = (Number(producto.precio) + precioModificadores) * it.cantidad;
    totalPedido += precioItem;

    itemsParaCrear.push({
      productoId: it.productoId,
      cantidad: it.cantidad,
      modificadoresSeleccionados: {
        create: modificadores.map((m) => ({
          opcionModificadorId: m.opcionModificadorId,
          cantidad: m.cantidad,
        })),
      },
    });
  }

  const pedido = await prisma.pedido.create({
    data: {
      localId,
      tipo,
      mesaId,
      canalOrigen,
      mozoId,
      items: { create: itemsParaCrear },
    },
    include: {
      items: {
        include: {
          producto: true,
          modificadoresSeleccionados: { include: { opcionModificador: true } },
        },
      },
    },
  });

  // Avisa en tiempo real a comandas/cocina y a la sala (mismo panel entre locales)
  io.to(`local:${localId}`).emit('pedido:nuevo', pedido);

  res.status(201).json({ ...pedido, totalCalculado: totalPedido });
});

app.patch('/api/pedidos/:id/items/:itemId/estado', async (req, res) => {
  const { estado } = req.body; // PENDIENTE | ENVIADO | LISTO
  const item = await prisma.itemPedido.update({
    where: { id: req.params.itemId },
    data: { estado },
  });
  io.emit('item:estado', item);
  res.json(item);
});

io.on('connection', (socket) => {
  socket.on('join:local', (localId) => socket.join(`local:${localId}`));
});

// ─── Caja ───────────────────────────────────

// Abrir caja: un cajero arranca su turno con un monto inicial en efectivo.
app.post('/api/cajas', async (req, res) => {
  const { localId, responsableId, montoInicial } = req.body;

  const cajaAbierta = await prisma.caja.findFirst({
    where: { localId, fechaCierre: null },
  });
  if (cajaAbierta) {
    return res.status(400).json({ error: 'Ya hay una caja abierta en este local', cajaId: cajaAbierta.id });
  }

  const caja = await prisma.caja.create({
    data: { localId, responsableId, montoInicial },
  });
  res.status(201).json(caja);
});

// Ver la caja abierta de un local (para saber si hay que abrir una o ya hay una activa).
app.get('/api/cajas/:localId/abierta', async (req, res) => {
  const caja = await prisma.caja.findFirst({
    where: { localId: req.params.localId, fechaCierre: null },
    include: { movimientos: true },
  });
  res.json(caja); // null si no hay ninguna abierta
});

// Cerrar caja: registra el monto final contado y calcula la diferencia contra
// lo esperado (monto inicial + ventas en efectivo registradas como movimientos).
app.patch('/api/cajas/:id/cerrar', async (req, res) => {
  const { montoFinal } = req.body;

  const caja = await prisma.caja.findUnique({
    where: { id: req.params.id },
    include: { movimientos: true },
  });
  if (!caja) return res.status(404).json({ error: 'Caja no encontrada' });
  if (caja.fechaCierre) return res.status(400).json({ error: 'Esta caja ya está cerrada' });

  const totalMovimientos = caja.movimientos.reduce((sum, m) => {
    const signo = m.tipo === 'retiro' || m.tipo === 'gasto' ? -1 : 1;
    return sum + signo * Number(m.monto);
  }, 0);
  const montoEsperado = Number(caja.montoInicial) + totalMovimientos;
  const diferencia = Number(montoFinal) - montoEsperado;

  const cajaCerrada = await prisma.caja.update({
    where: { id: req.params.id },
    data: { montoFinal, diferencia, fechaCierre: new Date() },
  });
  res.json(cajaCerrada);
});

// Registrar un movimiento manual de caja: retiro de efectivo, gasto, etc.
// (las ventas se registran solas al cobrar un pedido, ver /api/pedidos/:id/pagos)
app.post('/api/cajas/:id/movimientos', async (req, res) => {
  const { tipo, monto, descripcion } = req.body; // tipo: venta | retiro | gasto
  const movimiento = await prisma.movimientoCaja.create({
    data: { cajaId: req.params.id, tipo, monto, descripcion },
  });
  res.status(201).json(movimiento);
});

// ─── Pagos y comprobante ────────────────────

// Cobrar un pedido. Se puede llamar varias veces sobre el mismo pedido para
// dividir la cuenta (ej. la mitad en efectivo, la mitad con tarjeta).
// OJO: esto NO emite comprobante fiscal — eso es un paso aparte (ver abajo),
// tal como pide la sección 1.5 de la especificación.
app.post('/api/pedidos/:id/pagos', async (req, res) => {
  const { metodo, monto, propina = 0, descuento = 0, cajaId } = req.body;

  const pago = await prisma.pago.create({
    data: { pedidoId: req.params.id, metodo, monto, propina, descuento },
  });

  // Si el pago es en efectivo y se indicó una caja, queda registrado como
  // movimiento de "venta" para que el cierre de caja cuadre.
  if (metodo === 'EFECTIVO' && cajaId) {
    await prisma.movimientoCaja.create({
      data: {
        cajaId,
        tipo: 'venta',
        monto,
        descripcion: `Pago pedido ${req.params.id}`,
      },
    });
  }

  await prisma.pedido.update({
    where: { id: req.params.id },
    data: { estado: 'COBRADO' },
  });

  res.status(201).json(pago);
});

// Emitir comprobante. tipo = FISCAL (manda a DGI, en v2) o NO_FISCAL
// (ticket interno). Si el local cobra "sin ticket", este paso simplemente
// no se llama — el pedido queda COBRADO sin Comprobante asociado.
app.post('/api/pedidos/:id/comprobante', async (req, res) => {
  const { tipo } = req.body; // FISCAL | NO_FISCAL

  const comprobante = await prisma.comprobante.create({
    data: {
      pedidoId: req.params.id,
      tipo,
      // v1: no integramos DGI todavía (eso es v2, sección 1.7). Si es FISCAL,
      // lo dejamos marcado "pendiente" para no mentir que ya se envió.
      estadoDgi: tipo === 'FISCAL' ? 'pendiente' : null,
    },
  });

  await prisma.pedido.update({
    where: { id: req.params.id },
    data: { estado: 'CERRADO', cerradoAt: new Date() },
  });

  res.status(201).json(comprobante);
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`API corriendo en :${PORT}`));
