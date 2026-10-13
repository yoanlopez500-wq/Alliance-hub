// discord-notify — publica eventos de AllianceHub en servidores de Discord.
// Cero dependencias: PostgREST directo con la service_role (env estandar de las
// edge functions) + fetch nativo. Autenticacion: header x-hook-secret contra
// public.discord_config (RLS sellado, solo service_role).
// El fan-out lo hace push_notify: mismo disparador, mismo instante que el push.

const SUPA_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-hook-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const BRAND = 0x2b9348
const SITE = 'https://alliancehub.app'

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// ---------- PostgREST directo ----------
async function db(path: string, opts: { method?: string; body?: unknown; prefer?: string } = {}): Promise<unknown> {
  const res = await fetch(`${SUPA_URL}/rest/v1/${path}`, {
    method: opts.method ?? 'GET',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      ...(opts.prefer ? { Prefer: opts.prefer } : {}),
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  })
  const text = await res.text()
  if (!res.ok) {
    // 409 = conflicto de PK en insert (deduplicacion en carrera): no es error de red
    if (res.status === 409) return null
    throw new Error(`db ${opts.method ?? 'GET'} ${path} -> ${res.status}: ${text.slice(0, 200)}`)
  }
  return text ? JSON.parse(text) : null
}

async function getConfig(keys: string[]): Promise<Record<string, string>> {
  const rows = (await db(`discord_config?key=in.(${keys.join(',')})&select=key,value`)) as { key: string; value: string }[]
  const map: Record<string, string> = {}
  for (const r of rows ?? []) map[r.key] = r.value
  return map
}

// ---------- Discord API ----------
let botToken = ''

async function discordApi(path: string, method = 'GET', body?: unknown): Promise<unknown> {
  const res = await fetch(`https://discord.com/api/v10${path}`, {
    method,
    headers: { Authorization: `Bot ${botToken}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`discord ${method} ${path} -> ${res.status}: ${text.slice(0, 300)}`)
  }
  return res.status === 204 ? null : await res.json()
}

async function postWebhook(url: string, payload: Record<string, unknown>): Promise<void> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`webhook post -> ${res.status}: ${text.slice(0, 300)}`)
  }
}

function embed(title: string, description: string, extra: Record<string, unknown> = {}) {
  return { title: title.slice(0, 256), description: description.slice(0, 4096), color: BRAND, ...extra }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)
  if (!SUPA_URL || !SERVICE_KEY) return json({ error: 'missing env' }, 500)

  const cfg = await getConfig(['hook_secret', 'bot_token'])
  if (!cfg['hook_secret'] || req.headers.get('x-hook-secret') !== cfg['hook_secret']) {
    return json({ error: 'unauthorized' }, 401)
  }
  botToken = cfg['bot_token'] ?? ''

  interface Body {
    event?: string
    match_id?: string
    announcement_id?: string
    guild_id?: string
    alliance_id?: string
    channel_id?: string
    message?: string
    webhook_url?: string
    image_url?: string
    dry_run?: boolean
  }
  let body: Body
  try {
    body = await req.json()
  } catch {
    return json({ error: 'invalid JSON body' }, 400)
  }
  const { event, match_id, announcement_id, dry_run } = body
  if (!event) return json({ error: 'event is required' }, 400)

  // ---------- SETUP: vincular canal de un guild a una alianza ----------
  // Crea el webhook con la identidad del bot (MANAGE_WEBHOOKS). En la fase 2
  // /vincular llamara a esto tras validar el codigo de emparejamiento.
  if (event === 'setup') {
    const { guild_id, alliance_id, channel_id } = body
    if (!guild_id || !alliance_id || !channel_id) {
      return json({ error: 'guild_id, alliance_id and channel_id are required' }, 400)
    }
    if (!botToken) return json({ error: 'missing bot_token' }, 500)

    const alliances = (await db(`alliances?id=eq.${alliance_id}&select=id,name`)) as { id: string; name: string }[]
    const alliance = alliances?.[0]
    if (!alliance) return json({ error: 'alliance not found' }, 404)
    if (dry_run) return json({ dry_run: true, guild_id, alliance: alliance.name, channel_id })

    let guildName: string | null = null
    try {
      const g = (await discordApi(`/guilds/${guild_id}`)) as { name?: string }
      guildName = g.name ?? null
    } catch {
      return json({ error: 'bot is not in that guild (invite it first)' }, 400)
    }

    let wh: { url?: string; id?: string }
    try {
      wh = (await discordApi(`/channels/${channel_id}/webhooks`, 'POST', { name: 'AllianceHub' })) as { url?: string; id?: string }
    } catch (err) {
      // 403/404 tipicos: el bot no tiene Manage Webhooks en ESE canal, o el
      // canal no admite webhooks. Se reporta el motivo real al usuario.
      return json({ error: `no pude crear el webhook en ese canal: ${(err as Error).message}` }, 502)
    }
    if (!wh.url) return json({ error: 'discord did not return a webhook url' }, 500)

    // Si falla cualquier escritura en BD, se compensa borrando el webhook
    // que ya se creo en Discord, para no dejar vinculaciones parciales.
    try {
      await db('alliance_discord?on_conflict=alliance_id', {
        method: 'POST',
        prefer: 'resolution=merge-duplicates',
        body: {
          alliance_id,
          guild_id,
          channel_id,
          webhook_url: wh.url,
          linked_at: new Date().toISOString(),
        },
      })
      await db('discord_installations?on_conflict=guild_id', {
        method: 'POST',
        prefer: 'resolution=merge-duplicates',
        body: { guild_id, guild_name: guildName },
      })
    } catch (err) {
      try { await discordApi(`/webhooks/${wh.id}`, 'DELETE') } catch { /* best effort */ }
      return json({ error: `vinculacion fallo y se revierte: ${(err as Error).message}` }, 502)
    }

    try {
      await postWebhook(wh.url, {
        username: 'AllianceHub',
        embeds: [embed('✅ Canal vinculado', `Este canal recibirá los avisos de **${alliance.name}**. Usa el comando /avisos para configurar qué se publica.`)],
      })
    } catch {
      // no fatal
    }
    return json({ ok: true, alliance: alliance.name, guild: guildName, webhook_id: wh.id })
  }

  // ---------- DELETE_WEBHOOK (admin; limpieza de webhooks huérfanos) ----------
  if (event === 'delete_webhook') {
    const { webhook_url } = body
    if (!webhook_url) return json({ error: 'webhook_url is required' }, 400)
    const m = String(webhook_url).match(/webhooks\/(\d+)\/([^/?]+)/)
    if (!m) return json({ error: 'bad webhook_url' }, 400)
    try {
      await discordApi(`/webhooks/${m[1]}/${m[2]}`, 'DELETE')
      return json({ ok: true, deleted: true })
    } catch (err) {
      // 404 = ya no existe; también cuenta como limpio
      return json({ ok: true, deleted: false, reason: (err as Error).message })
    }
  }

  // ---------- GUILDS (descubrimiento; el sandbox no alcanza discord.com) ----------
  if (event === 'guilds') {
    if (!botToken) return json({ error: 'missing bot_token' }, 500)
    try {
      const guilds = (await discordApi('/users/@me/guilds')) as { id: string; name: string }[]
      const out = []
      for (const g of guilds) {
        const channels = (await discordApi(`/guilds/${g.id}/channels`)) as { id: string; name: string; type: number }[]
        out.push({
          guild_id: g.id,
          guild_name: g.name,
          channels: channels.filter((c) => c.type === 0).map((c) => ({ id: c.id, name: c.name })),
        })
      }
      return json({ guilds: out })
    } catch (err) {
      return json({ error: (err as Error).message }, 502)
    }
  }

  // ---------- TEST ----------
  if (event === 'test') {
    const msg = body.message ?? '🧪 Prueba de AllianceHub'
    const testEmbed = embed('🧪 Prueba', msg, body.image_url ? { image: { url: body.image_url } } : {})
    try {
      if (body.webhook_url) {
        await postWebhook(body.webhook_url, { username: 'AllianceHub', embeds: [testEmbed] })
        return json({ ok: true, via: 'webhook' })
      }
      if (body.guild_id && body.channel_id) {
        await discordApi(`/channels/${body.channel_id}/messages`, 'POST', { embeds: [testEmbed] })
        return json({ ok: true, via: 'channel' })
      }
      return json({ error: 'webhook_url or guild_id+channel_id required' }, 400)
    } catch (err) {
      return json({ error: (err as Error).message }, 502)
    }
  }

  // ---------- EVENTOS ----------
  const HANDLED = ['new_match', 'status_change', 'results_published', 'alliance_announcement']
  if (!HANDLED.includes(event)) return json({ skipped: true, reason: `event ${event} not handled by discord` })

  const alreadySent = async (subjectId: string): Promise<boolean> => {
    const rows = (await db(`discord_notification_log?subject_id=eq.${subjectId}&event=eq.${event}&select=subject_id`)) as unknown[]
    return !!rows?.length
  }
  const markSent = async (subjectId: string): Promise<void> => {
    await db('discord_notification_log', { method: 'POST', body: { subject_id: subjectId, event } })
  }

  // ----- Anuncio de alianza -----
  if (event === 'alliance_announcement') {
    if (!announcement_id) return json({ error: 'announcement_id is required' }, 400)
    const anns = (await db(`alliance_announcements?id=eq.${announcement_id}&select=id,alliance_id,title,body,image_url,expires_at`)) as {
      id: string; alliance_id: string | null; title: string; body: string | null; image_url: string | null; expires_at: string
    }[]
    const ann = anns?.[0]
    if (!ann) return json({ skipped: true, reason: 'announcement not found' })
    if (new Date(ann.expires_at) <= new Date()) return json({ skipped: true, reason: 'expired' })
    if (!ann.alliance_id) return json({ skipped: true, reason: 'global announcements not yet routed' })

    const links = (await db(`alliance_discord?alliance_id=eq.${ann.alliance_id}&select=webhook_url,alliance_notices`)) as { webhook_url: string; alliance_notices: boolean }[]
    const link = links?.[0]
    if (!link || !link.alliance_notices) return json({ skipped: true, reason: 'alliance channel not linked or notices off' })
    if (await alreadySent(announcement_id)) return json({ skipped: true, reason: 'already sent' })

    const als = (await db(`alliances?id=eq.${ann.alliance_id}&select=name`)) as { name: string }[]
    const name = als?.[0]?.name ?? 'Alianza'

    if (dry_run) return json({ dry_run: true, targets: 1, alliance: name })

    const e = embed(`📢 ${ann.title}`, ann.body ?? '', {
      image: ann.image_url ? { url: ann.image_url } : undefined,
      footer: { text: `${name} · AllianceHub` },
      timestamp: new Date().toISOString(),
    })
    try {
      await postWebhook(link.webhook_url, { username: name, embeds: [e] })
    } catch (err) {
      return json({ error: (err as Error).message }, 502)
    }
    await markSent(announcement_id)
    return json({ ok: true, posted: 1 })
  }

  // ----- Eventos de partida -----
  if (!match_id) return json({ error: 'match_id is required' }, 400)
  const matches = (await db(`matches?id=eq.${match_id}&select=id,name,match_type,status,alliance_id,category,is_official`)) as {
    id: string; name: string; match_type: string | null; status: string; alliance_id: string | null; category: string | null; is_official: boolean | null
  }[]
  const match = matches?.[0]
  if (!match) return json({ error: 'match not found' }, 404)

  let alLink: { webhook_url: string; alliance_notices: boolean } | null = null
  if (match.alliance_id) {
    const links = (await db(`alliance_discord?alliance_id=eq.${match.alliance_id}&select=webhook_url,alliance_notices`)) as { webhook_url: string; alliance_notices: boolean }[]
    alLink = links?.[0] ?? null
  }

  const targets: { kind: 'webhook' | 'channel'; dest: string; subject: string; label: string }[] = []

  if (alLink && alLink.alliance_notices) {
    targets.push({ kind: 'webhook', dest: alLink.webhook_url, subject: `match-${match_id}-${event}-alliance`, label: 'alliance' })
  } else if (!match.alliance_id) {
    const installs = (await db('discord_installations?global_channel_id=not.is.null&global_notices=eq.true&select=guild_id,global_channel_id')) as { guild_id: string; global_channel_id: string }[]
    for (const inst of installs ?? []) {
      targets.push({ kind: 'channel', dest: inst.global_channel_id, subject: `match-${match_id}-${event}-guild-${inst.guild_id}`, label: `guild:${inst.guild_id}` })
    }
  }

  if (targets.length === 0) return json({ skipped: true, reason: 'no targets' })
  if (dry_run) return json({ dry_run: true, targets: targets.map((t) => t.label) })

  let title = ''
  let desc = ''
  if (event === 'new_match') {
    const isBatallon = match.category === 'batallon'
    title = isBatallon ? `⚔ Nueva partida del Batallón: ${match.name}` : `⚔ Nueva partida: ${match.name}`
    desc = isBatallon ? 'Inscripción abierta por el grupo de WhatsApp del Batallón.' : 'Abierta para registro en AllianceHub.'
  } else if (event === 'results_published') {
    title = `🏁 Resultados publicados: ${match.name}`
    desc = 'Ya puedes consultar los resultados y el K/D de la partida.'
  } else {
    if (!alLink) return json({ skipped: true, reason: 'status changes only go to alliance channels' })
    title = `📋 ${match.name}: ${match.status}`
    desc = 'Cambio de estado de la partida.'
  }
  desc += `\n\n🔗 [Ver en AllianceHub](${SITE}/partidas/${match_id})`

  let posted = 0
  for (const t of targets) {
    if (await alreadySent(t.subject)) continue
    const e = embed(title, desc, { timestamp: new Date().toISOString() })
    try {
      if (t.kind === 'webhook') await postWebhook(t.dest, { embeds: [e] })
      else await discordApi(`/channels/${t.dest}/messages`, 'POST', { embeds: [e] })
      await markSent(t.subject)
      posted++
    } catch (err) {
      console.error('target failed', t.label, (err as Error).message)
    }
  }
  return json({ ok: true, posted, total: targets.length })
})
