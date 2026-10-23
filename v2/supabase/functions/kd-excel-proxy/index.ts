import { createClient } from 'jsr:@supabase/supabase-js@2'

// kd-excel-proxy — proxy autenticado hacia la API externa de nekokoneko.org
// (exportador de estadisticas K/D de Supremacy 1914).
//
// Resources (param `resource`, default 'kd'):
//   kd         -> GET /api/game/excels/kd/sup/:gameId (Excel legacy; MISMO
//                 comportamiento historico — no migrar a /api/v1 sin validar
//                 que el binario del .xlsx es identico).
//   players    -> GET /api/v1/games/sup/:gameId/players (roster oficial)
//   start-date -> GET /api/v1/games/sup/:gameId/start-date (JSON)
//
// Auth: Bearer token en public.push_config (key 'nekokoneko_token'), tabla
// sellada por RLS, solo legible con service role. Rotar = UPDATE en BD.
// Rate limit GLOBAL atomico: 1 permiso cada 15s en todo el sitio
// (api_import_acquire), igual para los 3 resources.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
}

const RATE_LIMIT_SECONDS = 15

const RESOURCES: Record<string, { upstream: (gameId: string) => string; contentType: string }> = {
  kd: {
    upstream: (id) => `https://nekokoneko.org/api/game/excels/kd/sup/${encodeURIComponent(id)}`,
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  },
  players: {
    upstream: (id) => `https://nekokoneko.org/api/v1/games/sup/${encodeURIComponent(id)}/players`,
    contentType: 'application/json',
  },
  'start-date': {
    upstream: (id) => `https://nekokoneko.org/api/v1/games/sup/${encodeURIComponent(id)}/start-date`,
    contentType: 'application/json',
  },
}

function jsonResponse(status: number, payload: unknown, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', ...extraHeaders },
  })
}

Deno.serve(async (req) => {
  // Handle preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const { searchParams } = new URL(req.url)
  const gameId = searchParams.get('gameId')
  const resource = searchParams.get('resource') ?? 'kd'

  if (!gameId || !/^\d+$/.test(gameId)) {
    return jsonResponse(400, { error: 'Invalid gameId' })
  }
  if (!RESOURCES[resource]) {
    return jsonResponse(400, { error: `Unknown resource '${resource}' (kd|players|start-date)` })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(500, { error: 'Supabase env missing' })
  }

  try {
    const cfg = createClient(supabaseUrl, serviceRoleKey)

    // ---- Rate limit GLOBAL: permiso atomico (1 cada 15s en todo el sitio) ----
    const { data: acquired, error: rlErr } = await cfg.rpc('api_import_acquire')
    if (rlErr) {
      return jsonResponse(500, { error: `rate limit check failed: ${rlErr.message}` })
    }
    if (!acquired) {
      return jsonResponse(429, { error: 'Rate limit: maximo 1 llamada cada 15 segundos (global)' }, {
        'Retry-After': String(RATE_LIMIT_SECONDS),
      })
    }

    // Token de la API externa (nekokoneko)
    const { data: tokRow, error: tokErr } = await cfg
      .from('push_config')
      .select('value')
      .eq('key', 'nekokoneko_token')
      .maybeSingle()
    if (tokErr) {
      return jsonResponse(500, { error: `token lookup failed: ${tokErr.message}` })
    }
    const bearerToken = tokRow?.value ?? null
    if (!bearerToken) {
      return jsonResponse(500, { error: 'missing nekokoneko_token in push_config' })
    }

    const target = RESOURCES[resource]
    const accept = resource === 'kd'
      ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, */*'
      : 'application/json, */*'

    const resp = await fetch(target.upstream(gameId), {
      headers: { 'Accept': accept, 'Authorization': `Bearer ${bearerToken}` },
    })

    if (!resp.ok) {
      const text = await resp.text()
      return jsonResponse(502, { error: 'Upstream error', status: resp.status, detail: text })
    }

    const body = await resp.arrayBuffer()

    return new Response(body, {
      headers: { ...corsHeaders, 'Content-Type': target.contentType },
    })
  } catch (err) {
    return jsonResponse(500, { error: (err as Error).message })
  }
})
