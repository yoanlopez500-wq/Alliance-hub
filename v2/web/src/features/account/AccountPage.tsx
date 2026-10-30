import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { publicDb } from '../../lib/api';
import { useAdmin, isStaffRole, allianceById } from '../../lib/admin';
import { useAnyPlayerId } from '../../lib/playerSession';
import { loadAlliances, type Alliance } from '../../lib/admin';
import { colors, styles } from '../../theme';
import Button from '../../components/Button';
import { Input } from '../../components/Field';
import Loader from '../../components/Loader';
import Section from '../../components/Section';
import PushToggle from '../../components/PushToggle';

/**
 * Mi cuenta — ajustes self-service para CUALQUIER usuario Auth (admin u oficial).
 * - Perfil: nombre visible propio (RPC acotada, nunca toca rol/alliance/vinculos).
 * - Discord: solo staff; la RLS de staff_discord_links ya limita el enlace al propio.
 * - Seguridad: contraseña, email y cierre de otras sesiones.
 * - Notificaciones: toggle push (si la identidad tiene jugador vinculado).
 */
export default function AccountPage() {
  const { admin, loading } = useAdmin();
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [noSession, setNoSession] = useState(false);
  const [alliances, setAlliances] = useState<Alliance[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await publicDb.auth.getSession();
      if (cancelled) return;
      if (!data.session) { setNoSession(true); return; }
      setSessionEmail(data.session.user.email ?? null);
      if (data.session) setAlliances(await loadAlliances());
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading && !noSession) return <Loader label="Cargando tu cuenta…" />;
  if (noSession) return <Navigate to="/login" replace />;

  const isStaff = isStaffRole(admin?.role);

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '24px 16px' }}>
      <h1 style={{ color: colors.text, margin: '0 0 4px' }}>👤 Mi cuenta</h1>
      <p style={{ color: colors.muted, margin: '0 0 20px' }}>
        Ajustes de tu cuenta. Sesión actual: <strong style={{ color: colors.text }}>{sessionEmail ?? '—'}</strong>
      </p>

      {admin && <ProfileSection admin={admin} alliances={alliances} />}
      {isStaff && <DiscordSection adminId={admin!.id} />}
      <SecuritySection />
      <PushSection />
    </div>
  );
}

/* ------------------------------- Perfil ------------------------------- */

function ProfileSection({ admin, alliances }: { admin: { id: string; role: string; display_name: string | null; alliance_id: string | null; supremacy_player_id?: number | null }; alliances: Alliance[] }) {
  const [name, setName] = useState(admin.display_name ?? '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const roleLabel: Record<string, string> = {
    superadmin: 'Superadmin', event_admin: 'Event Admin', moderator: 'Moderador',
    alliance_leader: 'Líder de alianza',
  };
  const myAlliance = allianceById(alliances, admin.alliance_id);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const trimmed = name.trim();
    if (!trimmed) { setMsg({ ok: false, text: 'El nombre visible no puede estar vacío.' }); return; }
    setBusy(true);
    try {
      const { data, error } = await publicDb.rpc('update_own_display_name', { p_display_name: trimmed });
      if (error) throw new Error(error.message);
      if (!data) { setMsg({ ok: false, text: 'No se pudo guardar (¿cuenta activa?).' }); return; }
      setMsg({ ok: true, text: '✓ Nombre visible actualizado.' });
    } catch (e2: any) {
      setMsg({ ok: false, text: e2.message });
    } finally { setBusy(false); }
  }

  return (
    <Section title="🪪 Perfil">
      <form onSubmit={save}>
        <label style={{ display: 'block', fontSize: 13, color: colors.muted, marginBottom: 4 }}>Nombre visible</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={50} style={{ flex: 1, minWidth: 200 }} />
          <Button type="submit" disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</Button>
        </div>
        {msg && <p style={{ color: msg.ok ? colors.success : colors.danger, fontSize: 13, margin: '8px 0 0' }}>{msg.text}</p>}
      </form>
      <p style={{ color: colors.muted, fontSize: 13, marginBottom: 0 }}>
        Rol: <strong style={{ color: colors.text }}>{roleLabel[admin.role] ?? admin.role}</strong>
        {myAlliance && <> · Alianza: <strong style={{ color: colors.text }}>{myAlliance.name}</strong></>}
        {admin.supremacy_player_id != null && <> · Jugador #{admin.supremacy_player_id}</>}
      </p>
      <p style={{ color: colors.muted, fontSize: 12, marginBottom: 0 }}>
        Rol, alianza y vínculo de jugador solo los cambia el staff (desde Administradores).
      </p>
    </Section>
  );
}

/* ------------------------------- Discord ------------------------------- */

type DiscordLink = { discord_user_id: string; enabled: boolean };

function DiscordSection({ adminId }: { adminId: string }) {
  const [link, setLink] = useState<DiscordLink | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function load() {
    const { data } = await publicDb.from('staff_discord_links')
      .select('discord_user_id, enabled').eq('admin_user_id', adminId).maybeSingle();
    const l = (data as DiscordLink | null) ?? null;
    setLink(l);
    setDraft(l?.discord_user_id ?? '');
  }
  useEffect(() => { load().catch(() => { /* noop */ }); }, [adminId]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const raw = draft.trim();
    if (!/^[0-9]{5,25}$/.test(raw)) { setMsg({ ok: false, text: 'ID de Discord inválido: solo números (5-25 dígitos).' }); return; }
    setBusy(true);
    try {
      const { error } = await publicDb.from('staff_discord_links').upsert({
        admin_user_id: adminId, discord_user_id: raw,
        enabled: link?.enabled ?? true, updated_at: new Date().toISOString(),
      }, { onConflict: 'admin_user_id' });
      if (error) throw new Error(error.message);
      setMsg({ ok: true, text: '✓ Discord guardado.' });
      await load();
    } catch (e2: any) { setMsg({ ok: false, text: e2.message }); }
    finally { setBusy(false); }
  }

  async function toggleEnabled() {
    if (!link) return;
    setBusy(true);
    const { error } = await publicDb.from('staff_discord_links')
      .update({ enabled: !link.enabled, updated_at: new Date().toISOString() })
      .eq('admin_user_id', adminId);
    if (!error) await load();
    setBusy(false);
  }

  async function remove() {
    if (!window.confirm('¿Quitar tu Discord vinculado?')) return;
    setBusy(true);
    const { error } = await publicDb.from('staff_discord_links').delete().eq('admin_user_id', adminId);
    if (!error) { setMsg({ ok: true, text: '✓ Discord eliminado.' }); await load(); }
    setBusy(false);
  }

  return (
    <Section title="💬 Discord">
      <p style={{ color: colors.muted, fontSize: 13, marginTop: 0 }}>
        ID numérico para recibir DMs del bot (avisos de solicitudes y moderación). Actívalo o siléncialo cuando quieras.
      </p>
      {link && (
        <p style={{ color: colors.text, fontSize: 13 }}>
          Estado: <strong style={{ color: link.enabled ? colors.success : colors.warning }}>{link.enabled ? 'activo' : 'silenciado'}</strong>
          {' · '}<button onClick={toggleEnabled} disabled={busy} style={{ background: 'transparent', border: 'none', color: colors.accent, cursor: 'pointer', fontSize: 13, padding: 0 }}>{link.enabled ? 'Silenciar' : 'Activar'}</button>
          {' · '}<button onClick={remove} disabled={busy} style={{ background: 'transparent', border: 'none', color: colors.danger, cursor: 'pointer', fontSize: 13, padding: 0 }}>Quitar</button>
        </p>
      )}
      <form onSubmit={save} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Ej: 123456789012345678" style={{ flex: 1, minWidth: 200 }} />
        <Button type="submit" disabled={busy}>{busy ? 'Guardando…' : link ? 'Actualizar' : 'Vincular'}</Button>
      </form>
      {msg && <p style={{ color: msg.ok ? colors.success : colors.danger, fontSize: 13, margin: '8px 0 0' }}>{msg.text}</p>}
    </Section>
  );
}

/* ------------------------------- Seguridad ------------------------------- */

function SecuritySection() {
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [emailDraft, setEmailDraft] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (pw.length < 6) { setMsg({ ok: false, text: 'La contraseña debe tener al menos 6 caracteres.' }); return; }
    if (pw !== pw2) { setMsg({ ok: false, text: 'Las contraseñas no coinciden.' }); return; }
    setBusy('pw');
    try {
      const { error } = await publicDb.auth.updateUser({ password: pw });
      if (error) throw new Error(error.message);
      setPw(''); setPw2('');
      setMsg({ ok: true, text: '✓ Contraseña actualizada.' });
    } catch (e2: any) { setMsg({ ok: false, text: e2.message }); }
    finally { setBusy(null); }
  }

  async function changeEmail(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const em = emailDraft.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) { setMsg({ ok: false, text: 'Email inválido.' }); return; }
    setBusy('email');
    try {
      const { error } = await publicDb.auth.updateUser({ email: em });
      if (error) throw new Error(error.message);
      setMsg({ ok: true, text: '✓ Solicitud enviada: confirma el nuevo email desde el enlace que te llegará.' });
    } catch (e2: any) { setMsg({ ok: false, text: e2.message }); }
    finally { setBusy(null); }
  }

  async function signOutOthers() {
    if (!window.confirm('¿Cerrar sesión en todos los demás dispositivos?')) return;
    setBusy('others');
    setMsg(null);
    try {
      const { error } = await publicDb.auth.signOut({ scope: 'others' });
      if (error) throw new Error(error.message);
      setMsg({ ok: true, text: '✓ Otras sesiones cerradas. Esta sigue activa.' });
    } catch (e2: any) { setMsg({ ok: false, text: e2.message }); }
    finally { setBusy(null); }
  }

  return (
    <Section title="🔐 Seguridad">
      <form onSubmit={changePassword}>
        <label style={{ display: 'block', fontSize: 13, color: colors.muted, marginBottom: 4 }}>Nueva contraseña (mín. 6)</label>
        <Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} style={{ marginBottom: 8 }} />
        <label style={{ display: 'block', fontSize: 13, color: colors.muted, marginBottom: 4 }}>Repetir contraseña</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} style={{ flex: 1, minWidth: 200 }} />
          <Button type="submit" disabled={busy === 'pw'}>{busy === 'pw' ? 'Cambiando…' : 'Cambiar contraseña'}</Button>
        </div>
      </form>
      <form onSubmit={changeEmail} style={{ marginTop: 16 }}>
        <label style={{ display: 'block', fontSize: 13, color: colors.muted, marginBottom: 4 }}>Nuevo email</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Input type="email" value={emailDraft} onChange={(e) => setEmailDraft(e.target.value)} placeholder="nuevo@email.com" style={{ flex: 1, minWidth: 200 }} />
          <Button type="submit" disabled={busy === 'email'}>{busy === 'email' ? 'Enviando…' : 'Cambiar email'}</Button>
        </div>
        <p style={{ color: colors.muted, fontSize: 12, marginBottom: 0 }}>Te llegará un enlace de confirmación al nuevo correo; el cambio no aplica hasta confirmarlo.</p>
      </form>
      <div style={{ marginTop: 16 }}>
        <Button onClick={signOutOthers} disabled={busy === 'others'}>
          {busy === 'others' ? 'Cerrando…' : '🚪 Cerrar sesión en otros dispositivos'}
        </Button>
      </div>
      {msg && <p style={{ color: msg.ok ? colors.success : colors.danger, fontSize: 13, margin: '12px 0 0' }}>{msg.text}</p>}
    </Section>
  );
}

/* ------------------------------- Push ------------------------------- */

function PushSection() {
  const playerId = useAnyPlayerId();
  if (!playerId) return null;
  return (
    <Section title="🔔 Notificaciones">
      <PushToggle playerId={playerId} />
    </Section>
  );
}
