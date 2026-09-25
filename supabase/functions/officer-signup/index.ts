// officer-signup
// Alta de OFICIALES como usuarios Auth (decision del usuario): el lider genera
// un codigo de invitacion (admin_invites, role='officer', su alliance_id y
// player_id vinculados); el oficial entra con el codigo + email + password y
// esta funcion crea su cuenta auth y su fila en alliance_officers, vinculada
// por auth_user_id. Asi RLS (is_alliance_manager) lo reconoce sin backend propio.
// Con compensacion: si falla el insert, borra el usuario auth creado.

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

const DEFAULT_OFFICER_PERMS = {
  manage_members: true, create_matches: true, view_strikes: true, view_reports: true,
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Metodo no permitido" }, 400);

  let body: { email?: string; password?: string; inviteCode?: string; displayName?: string };
  try { body = await req.json(); } catch { return json({ error: "Body JSON invalido" }, 400); }

  const email = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";
  const displayName = (body.displayName ?? "").trim();
  const inviteCode = (body.inviteCode ?? "").trim().toUpperCase();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Email invalido" }, 400);
  if (password.length < 6) return json({ error: "La contrasena debe tener al menos 6 caracteres" }, 400);
  if (!/^AH[A-Z0-9]{6,10}$/i.test(body.inviteCode ?? "")) {
    return json({ error: "Formato de codigo de invitacion invalido" }, 400);
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // 1) Invitacion valida: role='officer', sin usar, sin expirar, con alianza
  const { data: invite, error: invErr } = await supabaseAdmin
    .from("admin_invites")
    .select("id, code, role, alliance_id, player_id, used, expires_at")
    .eq("code", inviteCode).eq("used", false).maybeSingle();
  if (invErr) return json({ error: "Error consultando la invitacion" }, 500);
  if (!invite) return json({ error: "Codigo de invitacion invalido o ya usado" }, 400);
  if (invite.role !== "officer") return json({ error: "Este codigo no es de oficial" }, 400);
  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    return json({ error: "Codigo de invitacion expirado" }, 400);
  }
  if (!invite.alliance_id || !invite.player_id) {
    return json({ error: "Invitacion invalida: falta alianza o jugador vinculado" }, 400);
  }

  // 2) Crear usuario auth (email_confirm: entra directo)
  const { data: created, error: userErr } = await supabaseAdmin.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { display_name: displayName || email.split("@")[0] },
  });
  if (userErr || !created.user) {
    const msg = (userErr?.message ?? "").toLowerCase();
    if (msg.includes("already") || msg.includes("registered")) {
      return json({ error: "Ese email ya tiene cuenta, inicia sesion." }, 409);
    }
    return json({ error: userErr?.message ?? "Error creando la cuenta" }, 500);
  }
  const userId = created.user.id;

  // 3) Fila de oficial vinculada por auth_user_id
  const { error: offErr } = await supabaseAdmin.from("alliance_officers").insert({
    alliance_id: invite.alliance_id,
    player_id: invite.player_id,
    auth_user_id: userId,
    role: "officer",
    permissions: DEFAULT_OFFICER_PERMS,
    is_active: true,
  });
  if (offErr) {
    await supabaseAdmin.auth.admin.deleteUser(userId);
    if (offErr.code === "23505") return json({ error: "Este jugador ya es oficial activo" }, 409);
    return json({ error: offErr.message }, 500);
  }

  // 4) Marcar invitacion usada
  await supabaseAdmin.from("admin_invites")
    .update({ used: true, used_at: new Date().toISOString() })
    .eq("id", invite.id);

  return json({ ok: true, userId }, 200);
});
