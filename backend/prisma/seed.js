// Seed inicial — carga datos de prueba para poder probar la API.
// Correr con: npm run prisma:seed

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Limpiando datos previos (si existen)...');
  // Borramos en orden inverso a las dependencias, solo lo que toca este seed.
  await prisma.itemModificadorSeleccionado.deleteMany();
  await prisma.itemPedido.deleteMany();
  await prisma.pedido.deleteMany();
  await prisma.opcionModificador.deleteMany();
  await prisma.grupoModificador.deleteMany();
  await prisma.producto.deleteMany();
  await prisma.categoria.deleteMany();
  await prisma.menu.deleteMany();
  await prisma.mesa.deleteMany();
  await prisma.zona.deleteMany();
  await prisma.impresora.deleteMany();
  await prisma.grupoDispositivos.deleteMany();
  await prisma.canal.deleteMany();
  await prisma.local.deleteMany();

  console.log('Creando local...');
  const local = await prisma.local.create({
    data: {
      nombre: 'La Fusión - Local 33',
      direccion: 'Dirección de prueba 123',
    },
  });

  console.log('Creando canales (Cocina, Sushi, Pizza, Barra)...');
  const [cocina, sushi, pizza, barra] = await Promise.all([
    prisma.canal.create({ data: { nombre: 'Cocina' } }),
    prisma.canal.create({ data: { nombre: 'Sushi' } }),
    prisma.canal.create({ data: { nombre: 'Pizza' } }),
    prisma.canal.create({ data: { nombre: 'Barra' } }),
  ]);

  console.log('Creando grupo de dispositivos e impresoras...');
  const grupoDispositivos = await prisma.grupoDispositivos.create({
    data: { localId: local.id, nombre: 'Comandas Salón' },
  });

  // Cocina, Sushi y Pizza: copiaCompleta = true (imprimen todo el pedido, resaltando lo propio)
  await prisma.impresora.create({
    data: {
      grupoDispositivosId: grupoDispositivos.id,
      nombre: 'Comandera Cocina',
      tipoConexion: 'WiFi',
      contenido: 'COMANDA',
      copiaCompleta: true,
      canales: { connect: [{ id: cocina.id }] },
    },
  });
  await prisma.impresora.create({
    data: {
      grupoDispositivosId: grupoDispositivos.id,
      nombre: 'Comandera Sushi',
      tipoConexion: 'WiFi',
      contenido: 'COMANDA',
      copiaCompleta: true,
      canales: { connect: [{ id: sushi.id }] },
    },
  });
  await prisma.impresora.create({
    data: {
      grupoDispositivosId: grupoDispositivos.id,
      nombre: 'Comandera Pizza',
      tipoConexion: 'WiFi',
      contenido: 'COMANDA',
      copiaCompleta: true,
      canales: { connect: [{ id: pizza.id }] },
    },
  });
  // Barra: copiaCompleta = false (SOLO imprime los ítems de barra, filtro estricto)
  await prisma.impresora.create({
    data: {
      grupoDispositivosId: grupoDispositivos.id,
      nombre: 'Comandera Barra',
      tipoConexion: 'WiFi',
      contenido: 'COMANDA',
      copiaCompleta: false,
      canales: { connect: [{ id: barra.id }] },
    },
  });

  console.log('Creando menú "Cena"...');
  const menuCena = await prisma.menu.create({
    data: {
      localId: local.id,
      nombre: 'Cena',
      horarioInicio: '19:00',
      horarioFin: '23:30',
      activo: true,
    },
  });

  const catSushi = await prisma.categoria.create({
    data: { menuId: menuCena.id, nombre: 'Sushi', orden: 1 },
  });
  const catPizzas = await prisma.categoria.create({
    data: { menuId: menuCena.id, nombre: 'Pizzas', orden: 2 },
  });
  const catBebidas = await prisma.categoria.create({
    data: { menuId: menuCena.id, nombre: 'Bebidas', orden: 3 },
  });

  console.log('Creando productos...');

  // Ejemplo de "3x2 hots": grupo de modificadores con cupo gratis y contador (sección 1.4)
  const producto3x2 = await prisma.producto.create({
    data: {
      categoriaId: catSushi.id,
      nombre: '3x2 Hots',
      precio: 690,
      canalId: sushi.id,
      gruposModificadores: {
        create: [
          {
            nombre: '3x2 hot',
            cantidadGratis: 3,
            seleccionMax: null,
            opciones: {
              create: [
                { nombre: 'Hot Chicken', precioAdicional: 0 },
                { nombre: 'Hot Veggie', precioAdicional: 0 },
                { nombre: 'Hot Ebi', precioAdicional: 0 },
                { nombre: 'Hot Salmón', precioAdicional: 50 },
              ],
            },
          },
        ],
      },
    },
  });

  // Ejemplo de modificador simple sin costo, cupo 1 ("sin cebolla")
  await prisma.producto.create({
    data: {
      categoriaId: catPizzas.id,
      nombre: 'Pizza Muzzarella',
      precio: 780,
      canalId: pizza.id,
      gruposModificadores: {
        create: [
          {
            nombre: 'Sin ingrediente',
            cantidadGratis: 1,
            seleccionMax: 1,
            opciones: {
              create: [
                { nombre: 'Sin cebolla', precioAdicional: 0 },
                { nombre: 'Sin aceitunas', precioAdicional: 0 },
              ],
            },
          },
        ],
      },
    },
  });

  // Producto de Barra (solo este canal se filtra en la comandera de Barra)
  await prisma.producto.create({
    data: {
      categoriaId: catBebidas.id,
      nombre: 'Caipirinha',
      precio: 420,
      canalId: barra.id,
    },
  });

  console.log('Creando zona y mesas...');
  const zonaInterior = await prisma.zona.create({
    data: { localId: local.id, nombre: 'Interior' },
  });
  await prisma.mesa.createMany({
    data: [
      { zonaId: zonaInterior.id, numero: 1, capacidad: 2 },
      { zonaId: zonaInterior.id, numero: 2, capacidad: 4 },
      { zonaId: zonaInterior.id, numero: 3, capacidad: 4 },
    ],
  });

  console.log('✅ Seed completo.');
  console.log(`   Local ID: ${local.id}`);
  console.log(`   Producto "3x2 Hots" ID: ${producto3x2.id}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
