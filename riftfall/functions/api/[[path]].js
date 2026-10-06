// Cloudflare Pages: todas las rutas /api/* las atiende el servidor de la Cuenta Rift (cloud/api.mjs),
// con la base D1 enlazada como DB.
import { verifyMessage } from 'ethers';
import { createApi } from '../../cloud/api.mjs';

// La primera verificación de una firma de wallet arma unas tablas de la curva (~50 ms de procesador).
// Se hace al arrancar el servidor y no en el primer pedido: el plan gratis da 10 ms por pedido.
try {
  verifyMessage('rift-warmup', '0x648efb83da01b9a5854e48eb17b584c7d1d2a18b7be6a23956d4c66fa3ab44dd65bfc095a27030a1c8931772d1785d0e8c6c3399b8e57d1fa0dc54b82b7be6511c');
} catch {
  /* solo es para precalcular */
}

const api = createApi();

export const onRequest = (context) => api.handle(context.request, context.env);
