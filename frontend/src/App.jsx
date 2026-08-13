import { useEffect, useState } from 'react';
import { obtenerMenu, obtenerMesas, crearPedido } from './api.js';

// TODO: esto va a venir de un login/selector de local más adelante.
// Por ahora, para probar, hay que pegar acá el ID real del local que
// devuelve el seed (se imprime en consola al correr `npm run prisma:seed`
// en el backend).
const LOCAL_ID = import.meta.env.VITE_LOCAL_ID || 'PEGAR_LOCAL_ID_ACA';

export default function App() {
  const [pantalla, setPantalla] = useState('tipo'); // tipo | mesa | menu | confirmado
  const [tipoOrden, setTipoOrden] = useState(null);
  const [mesaId, setMesaId] = useState(null);
  const [zonas, setZonas] = useState([]);
  const [menu, setMenu] = useState(null);
  const [categoriaActiva, setCategoriaActiva] = useState(null);
  const [carrito, setCarrito] = useState({}); // productoId -> { producto, cantidad }
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);
  const [pedidoCreado, setPedidoCreado] = useState(null);

  function elegirTipo(tipo) {
    setTipoOrden(tipo);
    setError(null);
    if (tipo === 'MESA') {
      cargarMesas();
      setPantalla('mesa');
    } else {
      cargarMenu();
      setPantalla('menu');
    }
  }

  async function cargarMesas() {
    setCargando(true);
    try {
      const data = await obtenerMesas(LOCAL_ID);
      setZonas(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }

  async function cargarMenu() {
    setCargando(true);
    try {
      const data = await obtenerMenu(LOCAL_ID);
      // Tomamos el primer menú activo. Cuando haya varios (Cena/Cafetería/
      // Mediodía) filtrando por horario, esto se resuelve acá.
      const menuActivo = data[0] || null;
      setMenu(menuActivo);
      setCategoriaActiva(menuActivo?.categorias?.[0]?.id || null);
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }

  function elegirMesa(id) {
    setMesaId(id);
    setPantalla('menu');
    cargarMenu();
  }

  function cambiarCantidad(producto, delta) {
    setCarrito((prev) => {
      const actual = prev[producto.id]?.cantidad || 0;
      const nueva = Math.max(0, actual + delta);
      const copia = { ...prev };
      if (nueva === 0) {
        delete copia[producto.id];
      } else {
        copia[producto.id] = { producto, cantidad: nueva };
      }
      return copia;
    });
  }

  const totalPedido = Object.values(carrito).reduce(
    (sum, { producto, cantidad }) => sum + Number(producto.precio) * cantidad,
    0
  );

  async function comandar() {
    setCargando(true);
    setError(null);
    try {
      const items = Object.values(carrito).map(({ producto, cantidad }) => ({
        productoId: producto.id,
        cantidad,
        modificadores: [], // TODO: selección de modificadores (3x2, "sin cebolla", etc.)
      }));
      const pedido = await crearPedido({
        localId: LOCAL_ID,
        tipo: tipoOrden,
        mesaId: tipoOrden === 'MESA' ? mesaId : null,
        canalOrigen: 'SALON',
        items,
      });
      setPedidoCreado(pedido);
      setPantalla('confirmado');
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }

  function empezarDeNuevo() {
    setPantalla('tipo');
    setTipoOrden(null);
    setMesaId(null);
    setMenu(null);
    setCarrito({});
    setPedidoCreado(null);
    setError(null);
  }

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '1.5rem 1rem', minHeight: '100vh' }}>
      {LOCAL_ID === 'PEGAR_LOCAL_ID_ACA' && (
        <div className="card" style={{ marginBottom: 16, background: '#FAECE7', borderColor: '#C24A22' }}>
          <p style={{ margin: 0, fontSize: 13 }}>
            Falta configurar <code>VITE_LOCAL_ID</code> en <code>frontend/.env</code> con el ID real del local
            (lo imprime <code>npm run prisma:seed</code> en el backend).
          </p>
        </div>
      )}

      {error && (
        <div className="card" style={{ marginBottom: 16, background: '#FAECE7', borderColor: '#C24A22' }}>
          <p style={{ margin: 0, fontSize: 13, color: '#C24A22' }}>{error}</p>
        </div>
      )}

      {pantalla === 'tipo' && (
        <PantallaTipo onElegir={elegirTipo} />
      )}

      {pantalla === 'mesa' && (
        <PantallaMesa
          zonas={zonas}
          cargando={cargando}
          onVolver={() => setPantalla('tipo')}
          onElegir={elegirMesa}
        />
      )}

      {pantalla === 'menu' && (
        <PantallaMenu
          tipoOrden={tipoOrden}
          menu={menu}
          cargando={cargando}
          categoriaActiva={categoriaActiva}
          setCategoriaActiva={setCategoriaActiva}
          carrito={carrito}
          cambiarCantidad={cambiarCantidad}
          totalPedido={totalPedido}
          onVolver={() => setPantalla(tipoOrden === 'MESA' ? 'mesa' : 'tipo')}
          onComandar={comandar}
        />
      )}

      {pantalla === 'confirmado' && (
        <PantallaConfirmado pedido={pedidoCreado} onNuevo={empezarDeNuevo} />
      )}
    </div>
  );
}

function PantallaTipo({ onElegir }) {
  return (
    <div>
      <p style={{ fontSize: 18, fontWeight: 500, textAlign: 'center', margin: '0 0 1.5rem' }}>
        ¿Qué tipo de pedido es?
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <button className="btn" style={{ height: 56 }} onClick={() => onElegir('MESA')}>
          Mesa
        </button>
        <button className="btn" style={{ height: 56 }} onClick={() => onElegir('LLEVAR')}>
          Para llevar
        </button>
        <button className="btn" style={{ height: 56 }} onClick={() => onElegir('ENVIO')}>
          Envío
        </button>
      </div>
    </div>
  );
}

function PantallaMesa({ zonas, cargando, onVolver, onElegir }) {
  return (
    <div>
      <Header titulo="Elegí la mesa" onVolver={onVolver} />
      {cargando && <p style={{ color: 'var(--text-muted)' }}>Cargando mesas…</p>}
      {zonas.map((zona) => (
        <div key={zona.id} style={{ marginBottom: 16 }}>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 8px' }}>{zona.nombre}</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(64px, 1fr))', gap: 8 }}>
            {zona.mesas.map((mesa) => (
              <button
                key={mesa.id}
                className="btn"
                style={{ height: 56, fontSize: 16 }}
                onClick={() => onElegir(mesa.id)}
              >
                {mesa.numero}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function PantallaMenu({
  tipoOrden,
  menu,
  cargando,
  categoriaActiva,
  setCategoriaActiva,
  carrito,
  cambiarCantidad,
  totalPedido,
  onVolver,
  onComandar,
}) {
  const categoria = menu?.categorias?.find((c) => c.id === categoriaActiva);

  return (
    <div>
      <Header
        titulo={tipoOrden === 'MESA' ? 'Mesa' : tipoOrden === 'LLEVAR' ? 'Para llevar' : 'Envío'}
        onVolver={onVolver}
      />

      {cargando && <p style={{ color: 'var(--text-muted)' }}>Cargando menú…</p>}

      {menu && (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
            {menu.categorias.map((cat) => (
              <button
                key={cat.id}
                className={`btn btn-tab ${cat.id === categoriaActiva ? 'activo' : ''}`}
                onClick={() => setCategoriaActiva(cat.id)}
              >
                {cat.nombre}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {categoria?.productos.map((producto) => {
              const cantidad = carrito[producto.id]?.cantidad || 0;
              return (
                <div key={producto.id} className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <p style={{ margin: 0, fontSize: 14 }}>{producto.nombre}</p>
                    <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>${Number(producto.precio)}</p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button
                      className="btn btn-cantidad"
                      aria-label={`Quitar ${producto.nombre}`}
                      onClick={() => cambiarCantidad(producto, -1)}
                    >
                      −
                    </button>
                    <span style={{ minWidth: 16, textAlign: 'center', fontSize: 14 }}>{cantidad}</span>
                    <button
                      className="btn btn-cantidad"
                      aria-label={`Agregar ${producto.nombre}`}
                      onClick={() => cambiarCantidad(producto, 1)}
                    >
                      +
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <div style={{ marginTop: 20, borderTop: '1px solid var(--border)', paddingTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>Total</p>
          <p style={{ fontSize: 22, fontWeight: 500, margin: 0 }}>${totalPedido}</p>
        </div>
        <button className="btn btn-primary" style={{ height: 48 }} disabled={totalPedido === 0 || cargando} onClick={onComandar}>
          Comandar pedido
        </button>
      </div>
    </div>
  );
}

function PantallaConfirmado({ pedido, onNuevo }) {
  return (
    <div style={{ textAlign: 'center', paddingTop: '2rem' }}>
      <p style={{ fontSize: 18, fontWeight: 500 }}>Pedido enviado</p>
      <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
        Total: ${pedido?.totalCalculado ?? '—'}
      </p>
      <button className="btn btn-primary" style={{ height: 48, marginTop: 20 }} onClick={onNuevo}>
        Nuevo pedido
      </button>
    </div>
  );
}

function Header({ titulo, onVolver }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
      <button className="btn" aria-label="Volver" style={{ width: 40, height: 40, padding: 0 }} onClick={onVolver}>
        ←
      </button>
      <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>{titulo}</span>
    </div>
  );
}
