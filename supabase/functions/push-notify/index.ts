import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3'

// El secreto NO va en el codigo: vive en public.push_config (tabla sellada por RLS,
// solo legible con service role). Rotarlo = UPDATE en la BD, sin redesplegar.
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

// deno-lint-ignore no-explicit-any
type Supabase = any

// Loop de envio + limpieza de endpoints 404/410. Reutilizado por todos los eventos.
async function sendToSubs(
  supabase: Supabase,
  subs: PushSubscriptionRow[],
  payload: string,
): Promise<{ sent: number; failed: number }> {
  const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')
  const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY')
  const vapidSubject = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@alliancehub.app'
  if (!vapidPrivateKey) throw new Error('missing env VAPID_PRIVATE_KEY')
  if (!vapidPublicKey) throw new Error('missing env VAPID_PUBLIC_KEY')
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

  return { sent, failed }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return json({ error: 'method not allowed' }, 405)
  }
  // Required env for DB access (checked early for diagnostics)
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl) return json({ error: 'missing env SUPABASE_URL' }, 500)
  if (!serviceRoleKey) return json({ error: 'missing env SUPABASE_SERVICE_ROLE_KEY' }, 500)

  // Auth: comparar contra el secreto vigente en push_config (fuente unica de verdad)
  const authClient = createClient(supabaseUrl, serviceRoleKey)
  const { data: secretRow, error: secretErr } = await authClient
    .from('push_config')
    .select('value')
    .eq('key', 'hook_secret')
    .maybeSingle()
  if (secretErr) return json({ error: `hook_secret lookup failed: ${secretErr.message}` }, 500)
  if (!secretRow || req.headers.get('x-hook-secret') !== secretRow.value) {
    return json({ error: 'unauthorized' }, 401)
  }

  let body: { match_id?: string; event?: string; slot?: string; dry_run?: boolean }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'invalid JSON body' }, 400)
  }
  const { match_id, event, slot, dry_run } = body
  if (!event) {
    return json({ error: 'event is required' }, 400)
  }
  if (event !== 'new_match' && event !== 'status_change' && event !== 'batallon_reminder') {
    return json({ error: 'event must be new_match, status_change or batallon_reminder' }, 400)
  }
  if (event !== 'batallon_reminder' && !match_id) {
    return json({ error: 'match_id and event are required' }, 400)
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey) // public schema (default)

  // batallon_reminder: recordatorios 2x/dia (slot morning|afternoon) a jugadores
  // NO inscritos en partidas batallon abiertas. match_id es opcional: si viene,
  // procesa solo esa partida; si no, todas las batallon abiertas.
  if (event === 'batallon_reminder') {
    if (slot !== 'morning' && slot !== 'afternoon') {
      return json({ error: "slot must be 'morning' or 'afternoon'" }, 400)
    }
    let matchesQuery = supabase
      .from('matches')
      .select('id, name, category, status')
      .eq('category', 'batallon')
      .eq('status', 'open')
    if (match_id) matchesQuery = matchesQuery.eq('id', match_id)
    const { data: bMatches, error: bErr } = await matchesQuery
    if (bErr) return json({ error: `matches query failed: ${bErr.message}` }, 500)
    if (!bMatches || bMatches.length === 0) {
      return json({ skipped: true, reason: 'no open batallon matches' })
    }

    const today = new Date().toISOString().slice(0, 10)
    const logEvent = `batallon_reminder:${today}:${slot}`
    const results = []

    for (const m of bMatches) {
      // Dedupe por dia+slot (mismo patron: check antes, insert DESPUES de enviar)
      if (!dry_run) {
        const { data: already, error: logCheckErr } = await supabase
          .from('push_notification_log')
          .select('match_id')
          .eq('match_id', m.id)
          .eq('event', logEvent)
          .maybeSingle()
        if (logCheckErr) {
          return json({ error: `log check failed: ${logCheckErr.message}` }, 500)
        }
        if (already) {
          results.push({ match_id: m.id, name: m.name, skipped: true })
          continue
        }
      }

      // Destinatarios: subs con player_id NO nulo que NO tengan registro (cualquier
      // status) en esta partida. Volumenes pequenos: filtrado en memoria.
      const { data: regs, error: regErr } = await supabase
        .from('match_registrations')
        .select('player_id')
        .eq('match_id', m.id)
      if (regErr) return json({ error: `registrations query failed: ${regErr.message}` }, 500)
      const registeredIds = new Set((regs ?? []).map((r) => r.player_id).filter((id) => id != null))

      const { data: allSubs, error: subErr } = await supabase
        .from('push_subscriptions')
        .select('endpoint, p256dh, auth, player_id, alliance_id')
        .not('player_id', 'is', null)
      if (subErr) return json({ error: `subscriptions query failed: ${subErr.message}` }, 500)
      const subs = ((allSubs ?? []) as PushSubscriptionRow[]).filter(
        (s) => !registeredIds.has(s.player_id),
      )

      if (dry_run) {
        results.push({ match_id: m.id, name: m.name, dry_run: true, recipients: subs.length })
        continue
      }

      const payload = JSON.stringify({
        title: `⚔ ${m.name}: inscripcion abierta`,
        body: 'Aun no te inscribes. La inscripcion es por el grupo de WhatsApp del Batallon.',
        data: { url: `/game.html?id=${m.id}` },
        tag: `match-${m.id}-batallon-reminder-${today}-${slot}`,
      })

      try {
        const { sent, failed } = await sendToSubs(supabase, subs, payload)
        // Marcar como enviado SOLO tras el envio (mismo criterio que el flujo principal)
        if (sent > 0 || subs.length === 0) {
          await supabase
            .from('push_notification_log')
            .insert({ match_id: m.id, event: logEvent })
            .then(({ error }) => {
              if (error && error.code !== '23505') console.error('log insert failed', error)
            })
        }
        results.push({ match_id: m.id, name: m.name, sent, failed, total: subs.length })
      } catch (e) {
        return json({ error: (e as Error).message }, 500)
      }
    }

    return json({ success: true, event: logEvent, results })
  }

  // Load match
  const { data: match, error: matchErr } = await supabase
    .from('matches')
    .select('id, name, match_type, status, alliance_id, category')
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

  const isBatallon = match.category === 'batallon'
  const isAllianceMatch = !!match.alliance_id
  const title =
    event === 'new_match'
      ? isBatallon
        ? `⚔ Nueva partida del Batallon: ${match.name}`
        : isAllianceMatch
          ? `Nueva partida de tu alianza: ${match.name}`
          : `Nueva partida: ${match.name}`
      : isBatallon && match.status === 'in_progress'
        ? `⚔ ${match.name} ha comenzado`
        : `${match.name}: cambio de estado`
  const notificationBody =
    event === 'new_match'
      ? isBatallon
        ? 'Inscripcion abierta por el grupo de WhatsApp del Batallon.'
        : 'Estado: abierta para registro'
      : isBatallon && match.status === 'in_progress'
        ? 'La partida del Batallon ya inicio y esta en progreso.'
        : `La partida ahora esta en estado ${match.status}`

  const payload = JSON.stringify({
    title,
    body: notificationBody,
    data: { url: `/game.html?id=${match_id}` },
    tag: `match-${match_id}-${event}`,
  })

  let sent = 0
  let failed = 0
  try {
    const result = await sendToSubs(supabase, subs, payload)
    sent = result.sent
    failed = result.failed
  } catch (e) {
    // From here we actually send: VAPID env is required
    return json({ error: (e as Error).message }, 500)
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
