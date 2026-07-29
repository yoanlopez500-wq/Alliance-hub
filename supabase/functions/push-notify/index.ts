import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3'

const HOOK_SECRET = 'ah_push_7f3k9m2x8q1w'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-hook-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

interface PushSubscriptionRow {
  endpoint: string
  p256dh: string
  auth: string
  player_id: number | null
  alliance_id: string | null
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return json({ error: 'method not allowed' }, 405)
  }
  if (req.headers.get('x-hook-secret') !== HOOK_SECRET) {
    return json({ error: 'unauthorized' }, 401)
  }

  // Required env for DB access (checked early for diagnostics)
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl) return json({ error: 'missing env SUPABASE_URL' }, 500)
  if (!serviceRoleKey) return json({ error: 'missing env SUPABASE_SERVICE_ROLE_KEY' }, 500)

  let body: { match_id?: string; event?: string; dry_run?: boolean }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'invalid JSON body' }, 400)
  }
  const { match_id, event, dry_run } = body
  if (!match_id || !event) {
    return json({ error: 'match_id and event are required' }, 400)
  }
  if (event !== 'new_match' && event !== 'status_change') {
    return json({ error: 'event must be new_match or status_change' }, 400)
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey) // public schema (default)

  // Load match
  const { data: match, error: matchErr } = await supabase
    .from('matches')
    .select('id, name, match_type, status, alliance_id')
    .eq('id', match_id)
    .maybeSingle()
  if (matchErr) return json({ error: `match query failed: ${matchErr.message}` }, 500)
  if (!match) return json({ error: 'match not found' }, 404)

  // Dedupe: comprobar si ya se envio (el INSERT del log se hace DESPUES del envio,
  // para que un fallo de envio no marque el evento como enviado permanentemente)
  if (!dry_run) {
    const { data: already, error: logCheckErr } = await supabase
      .from('push_notification_log')
      .select('match_id')
      .eq('match_id', match_id)
      .eq('event', event)
      .maybeSingle()
    if (logCheckErr) return json({ error: `log check failed: ${logCheckErr.message}` }, 500)
    if (already) return json({ skipped: true })
  }

  // Resolve recipients
  let subs: PushSubscriptionRow[] = []
  if (event === 'new_match') {
    let query = supabase
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth, player_id, alliance_id')
    if (match.alliance_id) {
      query = query.eq('alliance_id', match.alliance_id)
    }
    const { data, error } = await query
    if (error) return json({ error: `subscriptions query failed: ${error.message}` }, 500)
    subs = (data ?? []) as PushSubscriptionRow[]
  } else {
    // status_change: only players registered (confirmed/approved) in the match
    const { data: regs, error: regErr } = await supabase
      .from('match_registrations')
      .select('player_id')
      .eq('match_id', match_id)
      .in('status', ['confirmed', 'approved'])
    if (regErr) return json({ error: `registrations query failed: ${regErr.message}` }, 500)
    const playerIds = [...new Set((regs ?? []).map((r) => r.player_id).filter((id) => id != null))]
    if (playerIds.length > 0) {
      const { data, error } = await supabase
        .from('push_subscriptions')
        .select('endpoint, p256dh, auth, player_id, alliance_id')
        .in('player_id', playerIds)
      if (error) return json({ error: `subscriptions query failed: ${error.message}` }, 500)
      subs = (data ?? []) as PushSubscriptionRow[]
    }
  }

  if (dry_run) {
    return json({ dry_run: true, recipients: subs.length, event, match: match.name })
  }

  // From here we actually send: VAPID env is required
  const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')
  const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY')
  const vapidSubject = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@alliancehub.com'
  if (!vapidPrivateKey) return json({ error: 'missing env VAPID_PRIVATE_KEY' }, 500)
  if (!vapidPublicKey) return json({ error: 'missing env VAPID_PUBLIC_KEY' }, 500)

  const isAllianceMatch = !!match.alliance_id
  const title =
    event === 'new_match'
      ? isAllianceMatch
        ? `Nueva partida de tu alianza: ${match.name}`
        : `Nueva partida: ${match.name}`
      : `${match.name}: cambio de estado`
  const notificationBody =
    event === 'new_match'
      ? 'Estado: abierta para registro'
      : `La partida ahora esta en estado ${match.status}`

  const payload = JSON.stringify({
    title,
    body: notificationBody,
    data: { url: `/game.html?id=${match_id}` },
    tag: `match-${match_id}-${event}`,
  })

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey)

  let sent = 0
  let failed = 0
  const staleEndpoints: string[] = []

  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
      )
      sent++
    } catch (err: unknown) {
      failed++
      const statusCode = (err as { statusCode?: number })?.statusCode
      if (statusCode === 404 || statusCode === 410) {
        staleEndpoints.push(sub.endpoint)
      }
    }
  }

  if (staleEndpoints.length > 0) {
    await supabase.from('push_subscriptions').delete().in('endpoint', staleEndpoints)
  }

  // Marcar como enviado SOLO tras el envio (si alguno tuvo exito o no habia destinatarios).
  // Si todos fallaron por errores distintos de 404/410, NO se marca: permite reintento.
  if (!dry_run && (sent > 0 || subs.length === 0)) {
    await supabase
      .from('push_notification_log')
      .insert({ match_id, event })
      .then(({ error }) => {
        // 23505 = carrera concurrente, otro proceso ya lo marco: ignorar
        if (error && error.code !== '23505') console.error('log insert failed', error)
      })
  }

  return json({ success: true, sent, failed, total: subs.length })
})
