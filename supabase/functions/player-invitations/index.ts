// player-invitations
// Edge function (service_role) que reemplaza al server v2 para el flujo
// de invitaciones del MERCADO visto con sesion de JUGADOR (token sellado).
// El staff de la alianza (lider/oficial auth) no pasa por aqui: usa RLS directo.
//
// Acciones:
//   { action: 'mine' }                          -> invitaciones pendientes del jugador
//   { action: 'respond', id, action:'accept'|'decline' }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Metodo no permitido" }, 400);

  // Autenticacion: "Player <playerId>:<token>" (token sellado del v1)
  const auth = req.headers.get("authorization") ?? "";
  const m = auth.match(/^Player\s+(\d+):(.+)$/);
  if (!m) return json({ error: "requiere sesion de jugador" }, 401);
  const playerId = Number(m[1]);
  const token = m[2];

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: ok } = await supabaseAdmin.rpc("verify_player_token", {
    p_player_id: playerId, p_token: token,
  });
  if (!ok) return json({ error: "token de jugador invalido" }, 401);

  let body: { action?: string; id?: string; action2?: string };
  try { body = await req.json(); } catch { return json({ error: "Body JSON invalido" }, 400); }

  // ---- mine: invitaciones pendientes con perfil publico de la alianza
  if (body.action === "mine") {
    const { data, error } = await supabaseAdmin
      .from("alliance_invitations")
      .select("id, alliance_id, message, created_at, expires_at, alliances:alliance_id(id, name, tag, description, profile)")
      .eq("player_id", playerId)
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false });
    if (error) return json({ error: error.message }, 500);
    return json({ data }, 200);
  }

  // ---- respond: aceptar o rechazar
  if (body.action === "respond") {
    const action = (body as any).respond;
    if (action !== "accept" && action !== "decline") {
      return json({ error: "respond debe ser accept o decline" }, 400);
    }
    const { data: inv } = await supabaseAdmin
      .from("alliance_invitations").select("*")
      .eq("id", body.id).eq("player_id", playerId).eq("status", "pending")
      .maybeSingle();
    if (!inv) return json({ error: "invitacion no encontrada o ya respondida" }, 404);

    const now = new Date().toISOString();
    await supabaseAdmin.from("alliance_invitations")
      .update({ status: action === "accept" ? "accepted" : "declined", responded_at: now })
      .eq("id", body.id);

    if (action === "accept") {
      const { error: memErr } = await supabaseAdmin.from("alliance_memberships")
        .insert({ player_id: playerId, alliance_id: inv.alliance_id, status: "approved" });
      if (memErr) return json({ error: memErr.message }, 500);
      // Cancelar solicitudes e invitaciones pendientes de otras alianzas
      await supabaseAdmin.from("alliance_memberships").delete()
        .eq("player_id", playerId).neq("alliance_id", inv.alliance_id);
      await supabaseAdmin.from("alliance_invitations")
        .update({ status: "cancelled", responded_at: now })
        .eq("player_id", playerId).eq("status", "pending");
      await supabaseAdmin.from("players")
        .update({ current_alliance_id: inv.alliance_id }).eq("id", playerId);
    }
    return json({ ok: true, status: action === "accept" ? "accepted" : "declined" }, 200);
  }

  return json({ error: "action desconocida" }, 400);
});
