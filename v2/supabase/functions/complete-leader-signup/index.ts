// complete-leader-signup
// Public endpoint (verify_jwt=false): transactional leader signup with invite code.
// Creates player (if needed) -> auth user -> admin_users -> leader membership
// -> marks invite used, with compensation (deletes auth user) if any step
// after createUser fails. The membership upsert covers regenerated codes and
// legacy accounts that exist without a membership row.

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
    displayName?: string;
    supremacyId?: number | string | null;
    discordUserId?: string;
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
  const discordUserId = (body.discordUserId ?? "").trim();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonResponse({ error: "Email inválido" }, 400);
  }
  if (password.length < 6) {
    return jsonResponse({ error: "La contraseña debe tener al menos 6 caracteres" }, 400);
  }
  // Nombre visible: OBLIGATORIO. Nunca se cae al email como username visible.
  if (!displayName || displayName.length > 50) {
    return jsonResponse({ error: "El nombre visible es obligatorio (máx. 50 caracteres)" }, 400);
  }
  if (discordUserId && !/^[0-9]{5,25}$/.test(discordUserId)) {
    return jsonResponse({ error: "ID de Discord inválido: solo números (5-25 dígitos)" }, 400);
  }
  // Acepta codigos AH+10 (actuales) y AH+6 (legacy pre-hardening)
  if (!/^AH[A-Z0-9]{6,10}$/i.test(body.inviteCode ?? "")) {
    return jsonResponse({ error: "Formato de código de invitación inválido" }, 400);
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // 3. Read and validate invite
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
  if (invite.role === "alliance_leader" && invite.alliance_id == null) {
    console.error("corrupt invite (leader without alliance):", invite.code);
    return jsonResponse({ error: "Invitación inválida: falta alianza asociada" }, 400);
  }
  console.log(`invite ${invite.code} valid (role=${invite.role})`);

  // 4. Ensure player row exists if invite references one.
  // El registrado SOLO puede aportar supremacyId cuando el invite NO trae
  // jugador vinculado (staff). Si el invite trae player_id, ese manda y el
  // valor enviado se ignora (nadie puede contradecir la invitacion).
  let linkedPlayerId: number | null = invite.player_id ?? null;
  if (invite.player_id == null && body.supremacyId != null && body.supremacyId !== "") {
    const parsed = Number(body.supremacyId);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      return jsonResponse({ error: "ID de jugador inválido. Debe ser un número positivo" }, 400);
    }
    // Anti-suplantacion: el ID no puede estar ya vinculado a otra cuenta admin
    const { data: taken, error: takenError } = await supabaseAdmin
      .from("admin_users")
      .select("id")
      .eq("supremacy_player_id", parsed)
      .limit(1);
    if (takenError) {
      console.error("supremacy link lookup error:", takenError);
      return jsonResponse({ error: "Error verificando ID de jugador" }, 500);
    }
    if (taken && taken.length > 0) {
      return jsonResponse({ error: "Ese ID de jugador ya está vinculado a otra cuenta admin" }, 409);
    }
    const { data: existingById } = await supabaseAdmin
      .from("players")
      .select("id")
      .eq("id", parsed)
      .maybeSingle();
    if (!existingById) {
      const { error: playerInsertError } = await supabaseAdmin
        .from("players")
        .insert({ id: parsed, current_username: displayName, status: "active" });
      if (playerInsertError) {
        console.error("player insert error:", playerInsertError);
        return jsonResponse({ error: "Error creando jugador" }, 500);
      }
      console.log(`player ${parsed} created (staff self-link)`);
    }
    linkedPlayerId = parsed;
  }
  if (linkedPlayerId != null) {
    const { data: existingPlayer, error: playerLookupError } = await supabaseAdmin
      .from("players")
      .select("id")
      .eq("id", linkedPlayerId)
      .maybeSingle();
    if (playerLookupError) {
      console.error("player lookup error:", playerLookupError);
      return jsonResponse({ error: "Error verificando jugador" }, 500);
    }
    if (!existingPlayer) {
      const { error: playerInsertError } = await supabaseAdmin
        .from("players")
        .insert({
          id: linkedPlayerId,
          current_username: displayName,
          status: "active",
        });
      if (playerInsertError) {
        console.error("player insert error:", playerInsertError);
        return jsonResponse({ error: "Error creando jugador" }, 500);
      }
      console.log(`player ${linkedPlayerId} created`);
    }
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
    user_metadata: { display_name: displayName },
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
    display_name: displayName,
    supremacy_player_id: linkedPlayerId,
    alliance_id: invite.alliance_id ?? null,
    approved_by: invite.created_by ?? null,
    approved_at: new Date().toISOString(),
    status: "active",
  });
  if (adminInsertError) {
    return await compensate("admin_users insert", adminInsertError);
  }
  console.log(`admin_users row created for ${userId}`);

  // 7a. Discord opcional (DMs del bot). Mismo contrato numérico que /admin/admins.
  if (discordUserId) {
    const { error: discordError } = await supabaseAdmin.from("staff_discord_links").upsert({
      admin_user_id: userId,
      discord_user_id: discordUserId,
      enabled: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: "admin_user_id" });
    if (discordError) {
      return await compensate("staff_discord_links upsert", discordError);
    }
    console.log(`discord link created for ${userId}`);
  }

  // 7b. Líder: asegurar membresía y vínculo (idempotente). Cubre códigos
  // regenerados y cuentas heredadas sin membresía (el caso EL MICTLAN).
  if (invite.role === "alliance_leader" && invite.player_id != null && invite.alliance_id != null) {
    const { error: membershipError } = await supabaseAdmin
      .from("alliance_memberships")
      .upsert(
        {
          player_id: invite.player_id,
          alliance_id: invite.alliance_id,
          role: "leader",
          status: "approved",
          requested_by: "leader",
        },
        { onConflict: "player_id,alliance_id" },
      );
    if (membershipError) {
      return await compensate("membership upsert", membershipError);
    }
    const { error: linkError } = await supabaseAdmin
      .from("players")
      .update({ current_alliance_id: invite.alliance_id })
      .eq("id", invite.player_id)
      .is("current_alliance_id", null);
    if (linkError) {
      console.error("player link warning (non-fatal):", linkError);
    }
    console.log(`leader membership ensured for player ${invite.player_id}`);
  }

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
    message: "Cuenta creada correctamente",
    role: invite.role,
    alliance_id: invite.alliance_id ?? null,
  }, 200);
});
