// creator-meta — rellena titulos de videos de creadores via oEmbed de YouTube.
// Sin API key: el endpoint oEmbed es publico y devuelve titulo/autor/miniatura.
// Auth: x-hook-secret contra discord_config (mismo secreto que los webhooks).
// Eventos: {event:'fill', profile_id} — rellena los videos sin titulo de un perfil.

const SUPA_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

async function db(path: string, opts: { method?: string; body?: unknown } = {}): Promise<unknown> {
  const res = await fetch(`${SUPA_URL}/rest/v1/${path}`, {
    method: opts.method ?? 'GET',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`db ${opts.method ?? 'GET'} ${path} -> ${res.status}: ${text.slice(0, 200)}`)
  return text ? JSON.parse(text) : null
}

async function oembedTitle(videoId: string): Promise<string | null> {
  try {
    const url = `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`
    const res = await fetch(url, { headers: { 'User-Agent': 'AllianceHub-creator-meta/1.0' } })
    if (!res.ok) return null
    const data = (await res.json()) as { title?: string }
    return data.title ?? null
  } catch {
    return null
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)
  if (!SUPA_URL || !SERVICE_KEY) return json({ error: 'missing env' }, 500)

  const cfg = (await db('discord_config?key=in.(hook_secret)&select=key,value')) as { key: string; value: string }[]
  const secret = cfg?.[0]?.value
  if (!secret || req.headers.get('x-hook-secret') !== secret) return json({ error: 'unauthorized' }, 401)

  let body: { event?: string; profile_id?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'invalid JSON body' }, 400)
  }
  if (body.event !== 'fill' || !body.profile_id) return json({ error: 'event=fill and profile_id required' }, 400)

  const videos = (await db(`creator_videos?profile_id=eq.${body.profile_id}&title=is.null&select=id,video_id&order=position.asc`)) as {
    id: string; video_id: string
  }[]
  if (!videos?.length) return json({ ok: true, filled: 0 })

  let filled = 0
  for (const v of videos.slice(0, 10)) {
    const title = await oembedTitle(v.video_id)
    if (title) {
      await db(`creator_videos?id=eq.${v.id}`, { method: 'PATCH', body: { title: title.slice(0, 200) } })
      filled++
    }
  }
  return json({ ok: true, filled, total: videos.length })
})
