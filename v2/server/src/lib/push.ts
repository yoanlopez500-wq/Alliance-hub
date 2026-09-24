import { supabase } from './supabase';

/**
 * Envio de push notifications via la edge function push-notify del v1.
 * El hook_secret se lee de push_config en runtime (mismo patron que el v1);
 * si falta configuracion, el envio se omite con log (no es fatal).
 *
 * NOTA: el evento 'alliance_invitation' requiere una actualizacion de
 * push-notify (incluida en esta rama, NO DESPLEGADA). Hasta entonces,
 * las llamadas con ese evento se registran y siguen adelante sin error.
 */
export async function sendPushToPlayers(opts: {
  event: string;
  playerIds: number[];
  title: string;
  body: string;
  url?: string;
  /** OBLIGATORIO para alliance_invitation: evita duplicados (ej. id de la invitacion) */
  dedupeKey?: string;
}): Promise<void> {
  try {
    const { data: cfg } = await supabase
      .from('push_config')
      .select('hook_secret, function_url')
      .limit(1)
      .maybeSingle();
    if (!cfg?.hook_secret) {
      appLog('push', 'sin push_config.hook_secret; push omitido');
      return;
    }
    const base = (cfg.function_url as string | null) ??
      `${process.env.SUPABASE_URL}/functions/v1/push-notify`;
    const res = await fetch(base, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-hook-secret': cfg.hook_secret as string,
      },
      body: JSON.stringify({
        event: opts.event,
        player_ids: opts.playerIds,
        push_title: opts.title,
        push_body: opts.body,
        url: opts.url,
        dedupe_key: opts.dedupeKey ?? null,
      }),
    });
    if (!res.ok) {
      appLog('push', `push-notify respondio ${res.status} para ${opts.event}`);
    }
  } catch (e) {
    appLog('push', `error enviando push: ${(e as Error).message}`);
  }
}

function appLog(scope: string, msg: string) {
  console.log(`[v2:${scope}] ${msg}`);
}
