// Todas las llamadas al backend viven acá, en un solo lugar.
// Así, si el día de mañana cambia la URL del servidor, solo se toca este archivo.

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export async function obtenerMenu(localId) {
  const res = await fetch(`${API_URL}/api/menus/${localId}`);
  if (!res.ok) throw new Error('No se pudo cargar el menú');
  return res.json();
}

export async function obtenerMesas(localId) {
  const res = await fetch(`${API_URL}/api/mesas/${localId}`);
  if (!res.ok) throw new Error('No se pudieron cargar las mesas');
  return res.json();
}

export async function crearPedido(pedido) {
  const res = await fetch(`${API_URL}/api/pedidos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(pedido),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'No se pudo crear el pedido');
  }
  return res.json();
}
