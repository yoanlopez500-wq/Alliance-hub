import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  // Handle preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const { searchParams } = new URL(req.url)
  const gameId = searchParams.get('gameId')

  if (!gameId || !/^\d+$/.test(gameId)) {
    return new Response(JSON.stringify({ error: 'Invalid gameId' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  try {
    const resp = await fetch(
      `https://nekokoneko.org/api/game/excels/kd/sup/${encodeURIComponent(gameId)}`,
      {
        headers: {
          'Accept': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, */*'
        }
      }
    )

    if (!resp.ok) {
      const text = await resp.text()
      return new Response(JSON.stringify({ error: 'Upstream error', status: resp.status, detail: text }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const body = await resp.arrayBuffer()

    return new Response(body, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      }
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
