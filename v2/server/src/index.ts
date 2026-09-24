import Fastify from 'fastify';
import { config } from './config';
import expedienteRoutes from './modules/expediente';
import sanctionsRoutes from './modules/sanctions';
import invitationsRoutes from './modules/invitations';
import matchTypesRoutes from './modules/match-types';

const app = Fastify({ logger: true });

// Modulos reutilizables: cada feature es un plugin con sus rutas.
// Para anadir una feature nueva se crea v2/server/src/modules/<nombre>.ts
// y se registra aqui — sin tocar los demas.
app.get('/api/health', async () => ({ ok: true, service: 'alliancehub-v2', version: '2.0.0-alpha.1' }));

await app.register(expedienteRoutes);
await app.register(sanctionsRoutes);
await app.register(invitationsRoutes);
await app.register(matchTypesRoutes);

await app.listen({ port: config.port, host: '0.0.0.0' });
