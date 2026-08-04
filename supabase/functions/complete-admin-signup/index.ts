// complete-admin-signup
// Public endpoint (verify_jwt=false): transactional STAFF signup with invite code
// (moderator / event_admin / superadmin; alliance_leader codes must use
// complete-leader-signup because they carry player_id/alliance_id linkage).
//
// Why this exists: the legacy client-side path (auth-core signupWithInvite)
// reads admin_invites with the anon key, but RLS only exposes invites with
// player_id NOT NULL to anon => staff invites (player_id NULL) were invisible
// and staff signup was broken end-to-end. Service role here bypasses RLS.
//
// Creates player (if needed) -> auth user -> admin_users -> marks invite used,
// with compensation (deletes auth user) if any step after createUser fails.
//
// Contract: POST {SUPABASE_URL}/functions/v1/complete-admin-signup
//   body: {email, password, inviteCode, supremacyId, displayName}
//   200 -> {success:true, message, role}
//   error -> {error} (400 invalid/expired/corrupt, 409 email taken, 500)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  // 1. CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Método no permitido" }, 400);
  }

  let body: {
    email?: string;
    password?: string;
    inviteCode?: string;
    supremacyId?: number | string;
    displayName?: string;
  };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Body JSON inválido" }, 400);
  }

  // 2. Input validation
  const email = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";
  const displayName = (body.displayName ?? "").trim();
  const inviteCode = (body.inviteCode ?? "").trim().toUpperCase();
  const supremacyId = typeof body.supremacyId === "string"
    ? parseInt(body.supremacyId, 10)
    : body.supremacyId;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonResponse({ error: "Email inválido" }, 400);
  }
  if (password.length < 6) {
    return jsonResponse({ error: "La contraseña debe tener al menos 6 caracteres" }, 400);
  }
  // Acepta códigos AH+10 (actuales) y AH+6 (legacy pre-hardening)
  if (!/^AH[A-Z0-9]{6,10}$/i.test(body.inviteCode ?? "")) {
    return jsonResponse({ error: "Formato de código de invitación inválido" }, 400);
  }
  if (supremacyId == null || isNaN(supremacyId)) {
    return jsonResponse({ error: "ID de jugador inválido" }, 400);
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // 3. Read and validate invite (service role: bypasses RLS, fixes staff-code invisibility)
  const { data: invite, error: inviteError } = await supabaseAdmin
    .from("admin_invites")
    .select("id, code, role, created_by, player_id, alliance_id, used, expires_at")
    .eq("code", inviteCode)
    .eq("used", false)
    .maybeSingle();

  if (inviteError) {
    console.error("invite lookup error:", inviteError);
    return jsonResponse({ error: "Error consultando la invitación" }, 500);
  }
  if (!invite) {
    return jsonResponse({ error: "Código de invitación inválido o ya usado" }, 400);
  }
  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    return jsonResponse({ error: "Código de invitación expirado" }, 400);
  }
  if (!invite.role) {
    console.error("corrupt invite (no role):", invite.code);
    return jsonResponse({ error: "Invitación inválida: sin rol asignado" }, 400);
  }
  if (invite.role === "alliance_leader") {
    // Leader codes carry player_id/alliance_id and must go through complete-leader-signup
    return jsonResponse({ error: "Este código es de líder de alianza: usa la página de registro de líder" }, 400);
  }
  console.log(`staff invite ${invite.code} valid (role=${invite.role})`);

  // 4. Ensure player row exists for the given supremacyId
  const { data: existingPlayer, error: playerLookupError } = await supabaseAdmin
    .from("players")
    .select("id")
    .eq("id", supremacyId)
    .maybeSingle();
  if (playerLookupError) {
    console.error("player lookup error:", playerLookupError);
    return jsonResponse({ error: "Error verificando jugador" }, 500);
  }
  if (!existingPlayer) {
    const { error: playerInsertError } = await supabaseAdmin
      .from("players")
      .insert({
        id: supremacyId,
        current_username: displayName || `Jugador ${supremacyId}`,
        status: "active",
      });
    if (playerInsertError) {
      console.error("player insert error:", playerInsertError);
      return jsonResponse({ error: "Error creando jugador" }, 500);
    }
    console.log(`player ${supremacyId} created`);
  }

  // 5. Check if email is already registered (paginate through users)
  let page = 1;
  const perPage = 200;
  let emailExists = false;
  while (!emailExists) {
    const { data: usersPage, error: listError } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage,
    });
    if (listError) {
      console.error("listUsers error:", listError);
      return jsonResponse({ error: "Error verificando usuarios existentes" }, 500);
    }
    const users = usersPage?.users ?? [];
    if (users.some((u) => (u.email ?? "").toLowerCase() === email)) {
      emailExists = true;
    } else if (users.length < perPage) {
      break;
    } else {
      page += 1;
    }
  }
  if (emailExists) {
    return jsonResponse({ error: "email ya registrado" }, 409);
  }

  // 6. Create auth user
  const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createError || !created?.user) {
    console.error("createUser error:", createError);
    const msg = (createError?.message ?? "").toLowerCase();
    if (msg.includes("already") || msg.includes("registered") || msg.includes("duplicate")) {
      return jsonResponse({ error: "email ya registrado" }, 409);
    }
    return jsonResponse({ error: "Error creando la cuenta" }, 500);
  }
  const userId = created.user.id;
  console.log(`auth user created: ${userId}`);

  // Compensation helper: delete the auth user if a later step fails
  const compensate = async (step: string, stepError: unknown) => {
    console.error(`step '${step}' failed, rolling back user ${userId}:`, stepError);
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (deleteError) {
      console.error("compensation deleteUser failed:", deleteError);
    } else {
      console.log(`compensation ok: user ${userId} deleted`);
    }
    return jsonResponse({ error: "Error completando el registro" }, 500);
  };

  // 7. Insert admin_users row
  const { error: adminInsertError } = await supabaseAdmin.from("admin_users").insert({
    id: userId,
    role: invite.role,
    display_name: displayName || email,
    supremacy_player_id: supremacyId,
    alliance_id: invite.alliance_id ?? null,
    approved_by: invite.created_by ?? null,
    approved_at: new Date().toISOString(),
    status: "active",
  });
  if (adminInsertError) {
    return await compensate("admin_users insert", adminInsertError);
  }
  console.log(`admin_users row created for ${userId} (role=${invite.role})`);

  // 8. Mark invite as used
  const { error: inviteUpdateError } = await supabaseAdmin
    .from("admin_invites")
    .update({ used: true, used_by: userId, used_at: new Date().toISOString() })
    .eq("id", invite.id)
    .eq("used", false);
  if (inviteUpdateError) {
    return await compensate("invite mark used", inviteUpdateError);
  }
  console.log(`invite ${invite.code} marked used by ${userId}`);

  return jsonResponse({
    success: true,
    message: `Cuenta de ${invite.role} creada exitosamente.`,
    role: invite.role,
  }, 200);
});
