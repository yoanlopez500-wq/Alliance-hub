import Fastify from 'fastify';
import { config } from './config';
import authRoutes from './modules/auth';
import expedienteRoutes from './modules/expediente';
import sanctionsRoutes from './modules/sanctions';
import invitationsRoutes from './modules/invitations';
import matchTypesRoutes from './modules/match-types';
import spacesRoutes from './modules/spaces';

const app = Fastify({ logger: true });

// CORS minimo: el web puede servirse en otro origen que el server (produccion).
// En dev no hace falta (vite proxy), pero lo dejamos para cualquier despliegue.
app.addHook('onRequest', async (req, reply) => {
  reply.header('Access-Control-Allow-Origin', process.env.CORS_ORIGIN ?? '*');
  reply.header('Access-Control-Allow-Headers', 'authorization, content-type');
  reply.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return reply.code(204).send();
});

// Modulos reutilizables: cada feature es un plugin con sus rutas.
// Para anadir una feature nueva se crea v2/server/src/modules/<nombre>.ts
// y se registra aqui — sin tocar los demas.
app.get('/api/health', async () => ({ ok: true, service: 'alliancehub-v2', version: '2.0.0-alpha.1' }));

await app.register(authRoutes);
await app.register(expedienteRoutes);
await app.register(sanctionsRoutes);
await app.register(invitationsRoutes);
await app.register(matchTypesRoutes);
await app.register(spacesRoutes);

await app.listen({ port: config.port, host: '0.0.0.0' });
