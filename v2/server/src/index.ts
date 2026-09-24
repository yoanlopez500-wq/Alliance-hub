import Fastify from 'fastify';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const app = Fastify({ logger: true });

// Cliente Supabase con service_role: SOLO en el servidor, nunca expuesto al browser.
const supabase = createClient(
  process.env.SUPABASE_URL ?? '',
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
);

app.get('/api/health', async () => ({ ok: true, service: 'alliancehub-v2' }));

// Ejemplo futuro: expediente publico de jugador (mercado de transferencias)
app.get('/api/players/:id/expediente', async (req, reply) => {
  const { id } = req.params as { id: string };
  // TODO(v2): partidas, estadisticas, strikes globales. Strikes de alianza solo via auth de lider receptor.
  const { data, error } = await supabase.from('players').select('*').eq('id', id).single();
  if (error) return reply.code(404).send({ error: error.message });
  return data;
});

const port = Number(process.env.PORT ?? 3001);
app.listen({ port, host: '0.0.0.0' });
