import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { publicDb, fetchMe, type Me } from '../../lib/api';
import { generateInviteCode } from '../../lib/invites';
import { useMatchTypes, selectableTypes } from '../../lib/matchTypes';
import { colors } from '../../theme';
import Button from '../../components/Button';
import { Select } from '../../components/Field';
import Loader from '../../components/Loader';

/**
 * OfficerAlliancePage — "Gestion de mi alianza" para oficiales/co-lideres.
 * Sin AdminGate: la propia cuenta auth (alliance_officers) es el permiso y
 * las acciones sensibles las verifica RLS/RPC server-side.
 *   - oficial basico: lectura (miembros, solicitudes) + enlaces de reporte.
 *   - co_lider: ademas invitar oficiales, aprobar/expulsar miembros y crear partidas.
 */

interface MemberRow {
  membershipId: string;
  playerId: number;
  username: string;
  membershipRole: string;
}

interface RequestRow {
  membershipId: string;
  playerId: number;
  requestedAt: string;
}

const card: React.CSSProperties = { background: colors.cardAlt, border: `1px solid ${colors.border}`, borderRadius: 12, padding: 14 };
const actionStyle: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: colors.accent, textDecoration: 'none', padding: '4px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.06)', border: `1px solid ${colors.border}`, whiteSpace: 'nowrap' };
const labelStyle: React.CSSProperties = { display: 'block', fontSize: 13, color: colors.muted, marginBottom: 4 };

export default function OfficerAlliancePage() {
  const navigate = useNavigate();
  const [me, setMe] = useState<Me | null>(null);
  const [meLoading, setMeLoading] = useState(true);
  const [alliance, setAlliance] = useState<{ id: string; name: string; tag: string | null } | null>(null);
  const [members, setMembers] = useState<MemberRow[] | null>(null);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [officerRoles, setOfficerRoles] = useState<Map<number, string>>(new Map());
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);
  const { types: matchTypes } = useMatchTypes();

  // Crear partida (co-lider)
  const [cmOpen, setCmOpen] = useState(false);
  const [cmName, setCmName] = useState('');
  const [cmGameId, setCmGameId] = useState('');
  const [cmType, setCmType] = useState('internal');
  const [cmPublic, setCmPublic] = useState(false);

  // Invitar oficial (co-lider)
  const [inviteTarget, setInviteTarget] = useState<MemberRow | null>(null);
  const [inviteRole, setInviteRole] = useState<'officer' | 'co_leader'>('officer');
  const [inviteResult, setInviteResult] = useState<{ code: string; name: string } | null>(null);

  const allianceId = me?.managedAllianceId ?? null;
  const isColeader = me?.officerRole === 'co_leader';

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 4000);
  }

  useEffect(() => {
    let alive = true;
    fetchMe().then((m) => { if (alive) { setMe(m); setMeLoading(false); } })
      .catch(() => { if (alive) setMeLoading(false); });
    return () => { alive = false; };
  }, []);

  const load = useCallback(async () => {
    if (!allianceId) return;
    try {
      const { data: al } = await publicDb.from('alliances').select('id, name, tag').eq('id', allianceId).maybeSingle();
      setAlliance((al as { id: string; name: string; tag: string | null }) ?? null);

      const { data: ms } = await publicDb.from('alliance_memberships')
        .select('id, player_id, role').eq('alliance_id', allianceId).eq('status', 'approved');
      const mids = (ms ?? []) as { id: string; player_id: number; role: string }[];
      const playersRes = mids.length
        ? await publicDb.from('players').select('id, current_username').in('id', mids.map((m) => m.player_id))
        : { data: [] as { id: number; current_username: string | null }[] };
      const names = new Map(((playersRes.data ?? []) as { id: number; current_username: string | null }[]).map((p) => [p.id, p.current_username ?? `#${p.id}`]));
      setMembers(mids.map((m) => ({ membershipId: m.id, playerId: m.player_id, username: names.get(m.player_id) ?? `#${m.player_id}`, membershipRole: m.role ?? 'member' })));

      const { data: rq } = await publicDb.from('alliance_memberships')
        .select('id, player_id, requested_at').eq('alliance_id', allianceId)
        .eq('status', 'pending').eq('requested_by', 'player').order('requested_at', { ascending: false });
      setRequests(((rq ?? []) as { id: string; player_id: number; requested_at: string }[]).map((r) => ({ membershipId: r.id, playerId: r.player_id, requestedAt: r.requested_at })));

      const { data: offs } = await publicDb.from('alliance_officers')
        .select('player_id, role').eq('alliance_id', allianceId).eq('is_active', true);
      setOfficerRoles(new Map(((offs ?? []) as { player_id: number; role: string }[]).map((o) => [o.player_id, o.role])));
    } catch (e) {
      console.error('[OfficerAlliance] Error cargando:', e);
    }
  }, [allianceId]);

  useEffect(() => { if (allianceId) load(); }, [allianceId, load]);

  async function approve(r: RequestRow) {
    setBusy(true);
    try {
      const { data, error } = await publicDb.rpc('alliance_approve_member', { p_membership_id: r.membershipId });
      if (error) throw error;
      if (!data) { showToast('No autorizado o solicitud inválida'); return; }
      showToast(`Solicitud de #${r.playerId} aprobada`);
      await load();
    } catch (e: any) { showToast('Error: ' + (e.message ?? e)); }
    finally { setBusy(false); }
  }

  async function reject(r: RequestRow) {
    setBusy(true);
    try {
      const { error } = await publicDb.from('alliance_memberships').update({ status: 'rejected' }).eq('id', r.membershipId);
      if (error) throw error;
      showToast('Solicitud rechazada');
      await load();
    } catch (e: any) { showToast('Error: ' + (e.message ?? e)); }
    finally { setBusy(false); }
  }

  async function kick(m: MemberRow) {
    if (!window.confirm(`¿Expulsar a ${m.username} de la alianza?`)) return;
    setBusy(true);
    try {
      const { data, error } = await publicDb.rpc('alliance_remove_member', { p_player_id: m.playerId });
      if (error) throw error;
      if (!data) { showToast('No autorizado (solo co-líder puede expulsar)'); return; }
      showToast(`${m.username} expulsado`);
      await load();
    } catch (e: any) { showToast('Error: ' + (e.message ?? e)); }
    finally { setBusy(false); }
  }

  async function inviteOfficer() {
    if (!inviteTarget || !allianceId) return;
    setBusy(true);
    try {
      const { data: sessData } = await publicDb.auth.getSession();
      const code = generateInviteCode();
      const { error } = await publicDb.from('admin_invites').insert({
        code,
        role: inviteRole,
        alliance_id: allianceId,
        player_id: inviteTarget.playerId,
        created_by: sessData.session?.user.id,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      });
      if (error) throw error;
      setInviteResult({ code, name: inviteTarget.username });
      setInviteTarget(null);
    } catch (e: any) { showToast(e.message || 'Error creando la invitación'); }
    finally { setBusy(false); }
  }

  async function createMatch() {
    if (!allianceId) return;
    const name = cmName.trim();
    if (!name) { showToast('Nombre obligatorio'); return; }
    setBusy(true);
    try {
      const { data: sessData } = await publicDb.auth.getSession();
      const session = sessData.session;
      if (!session) throw new Error('No hay sesión activa');
      const selected = selectableTypes(matchTypes, allianceId).find((t) => t.id === cmType);
      const isPrivate = selected ? selected.scope !== 'global' && !cmPublic : true;
      const { data, error } = await publicDb.from('matches').insert({
        name,
        game_id: cmGameId.trim() || null,
        alliance_id: allianceId,
        match_type: cmType,
        max_players: 31,
        is_private: isPrivate,
        requires_approval: false,
        status: 'draft',
        created_by: session.user.id,
      }).select('id').single();
      if (error) throw error;
      showToast('Partida creada');
      setCmOpen(false);
      setCmName(''); setCmGameId('');
      navigate('/partidas/' + (data as { id: string }).id);
    } catch (e: any) { showToast('Error: ' + (e.message ?? e)); }
    finally { setBusy(false); }
  }

  if (meLoading) return <Loader label="Verificando acceso..." />;
  if (!me?.officerRole || !allianceId) {
    return (
      <div style={{ maxWidth: 480, margin: '80px auto', textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🔒</div>
        <h2 style={{ color: colors.text }}>Acceso restringido</h2>
        <p style={{ color: colors.muted }}>Esta sección es para oficiales y co-líderes de alianza.</p>
        <Link to="/login" style={{ color: colors.accent, fontWeight: 700 }}>Ir al login</Link>
      </div>
    );
  }

  const selectable = selectableTypes(matchTypes, allianceId);

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 6 }}>
        <h1 style={{ fontSize: 26, margin: 0, color: colors.text }}>
          🛠 Gestión de mi alianza — {alliance ? `${alliance.name}${alliance.tag ? ` [${alliance.tag}]` : ''}` : '...'}
        </h1>
        <span style={{ fontSize: 12, fontWeight: 700, color: isColeader ? colors.purple : colors.info, border: `1px solid ${isColeader ? colors.purple : colors.info}`, borderRadius: 20, padding: '4px 12px' }}>
          {isColeader ? '⭐ CO-LÍDER' : '🎖 OFICIAL'}
        </span>
      </div>
      <p style={{ color: colors.muted, fontSize: 13, margin: '0 0 16px' }}>
        {isColeader
          ? 'Puedes aprobar solicitudes, expulsar miembros, invitar oficiales y crear partidas.'
          : 'Modo lectura: ver miembros y solicitudes. Tu líder puede ampliar tus permisos nombrándote co-líder.'}
      </p>

      {toast && <div style={{ background: colors.success + '20', color: colors.success, padding: '10px 14px', borderRadius: 8, marginBottom: 12 }}>{toast}</div>}

      {isColeader && (
        <div style={{ marginBottom: 16 }}>
          <Button onClick={() => setCmOpen(true)}>+ Crear partida</Button>
        </div>
      )}

      {requests.length > 0 && (
        <div style={{ ...card, marginBottom: 16, borderColor: colors.warning }}>
          <h3 style={{ margin: '0 0 10px', fontSize: 15, color: colors.warning }}>📨 Solicitudes pendientes ({requests.length})</h3>
          {requests.map((r) => (
            <div key={r.membershipId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '8px 0', borderTop: `1px solid ${colors.border}` }}>
              <span style={{ fontSize: 14, color: colors.text }}>Jugador #{r.playerId}</span>
              {isColeader ? (
                <div style={{ display: 'flex', gap: 6 }}>
                  <Button style={{ fontSize: 12 }} disabled={busy} onClick={() => approve(r)}>✓ Aprobar</Button>
                  <Button variant="ghost" style={{ fontSize: 12 }} disabled={busy} onClick={() => reject(r)}>Rechazar</Button>
                </div>
              ) : <span style={{ fontSize: 12, color: colors.muted }}>esperando a un co-líder</span>}
            </div>
          ))}
        </div>
      )}

      <h3 style={{ fontSize: 16, color: colors.text, margin: '0 0 10px' }}>👥 Miembros ({members?.length ?? 0})</h3>
      {members === null ? <Loader /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {members.map((m) => {
            const offRole = officerRoles.get(m.playerId);
            const isLeader = m.membershipRole === 'leader';
            return (
              <div key={m.membershipId} style={{ ...card, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <span style={{ fontWeight: 700, fontSize: 14, color: colors.text }}>{m.username}</span>
                  <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, color: colors.muted }}>#{m.playerId}</span>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  {isLeader && <span style={{ fontSize: 11, fontWeight: 700, color: colors.warning }}>👑 LÍDER</span>}
                  {offRole === 'co_leader' && <span style={{ fontSize: 11, fontWeight: 700, color: colors.purple }}>⭐ CO-LÍDER</span>}
                  {offRole === 'officer' && <span style={{ fontSize: 11, fontWeight: 700, color: colors.info }}>🎖 OFICIAL</span>}
                  <Link to={`/jugador/${m.playerId}`} style={actionStyle}>👤 Perfil</Link>
                  {!isLeader && <Link to={`/alianza/sanciones?prefill_player=${m.playerId}`} style={actionStyle}>⚡ Strike</Link>}
                  {isColeader && !isLeader && !offRole && (
                    <button onClick={() => { setInviteRole('officer'); setInviteTarget(m); }} style={{ ...actionStyle, cursor: 'pointer' }}>🎖 Invitar</button>
                  )}
                  {isColeader && !isLeader && (
                    <button onClick={() => kick(m)} disabled={busy} style={{ ...actionStyle, cursor: 'pointer', color: colors.danger, borderColor: colors.danger }}>✗ Expulsar</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {cmOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }} onClick={() => setCmOpen(false)}>
          <div style={{ background: colors.card, border: `1px solid ${colors.border}`, borderRadius: 16, padding: 24, maxWidth: 460, width: '100%' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0, color: colors.text }}>Crear partida — {alliance?.name}</h3>
            <label style={labelStyle}>Nombre *</label>
            <input value={cmName} onChange={(e) => setCmName(e.target.value)} style={{ width: '100%', marginBottom: 10, background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 8, padding: '9px 12px', color: colors.text }} />
            <label style={labelStyle}>ID de partida (Supremacy, opcional)</label>
            <input value={cmGameId} onChange={(e) => setCmGameId(e.target.value)} style={{ width: '100%', marginBottom: 10, background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 8, padding: '9px 12px', color: colors.text }} />
            <label style={labelStyle}>Tipo</label>
            <Select value={cmType} onChange={(e) => setCmType(e.target.value)} style={{ width: '100%', marginBottom: 10 }}>
              {selectable.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              {selectable.length === 0 && <option value="internal">Interna</option>}
            </Select>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: colors.text, margin: '4px 0 14px' }}>
              <input type="checkbox" checked={cmPublic} onChange={(e) => setCmPublic(e.target.checked)} />
              Visible públicamente (si el tipo lo permite)
            </label>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Button variant="ghost" onClick={() => setCmOpen(false)}>Cancelar</Button>
              <Button onClick={createMatch} disabled={busy}>{busy ? 'Creando…' : 'Crear partida'}</Button>
            </div>
          </div>
        </div>
      )}

      {inviteTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }} onClick={() => setInviteTarget(null)}>
          <div style={{ background: colors.card, border: `1px solid ${colors.border}`, borderRadius: 16, padding: 24, maxWidth: 440, width: '100%' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0, color: colors.text }}>🎖 Invitar — {inviteTarget.username}</h3>
            <p style={{ fontSize: 12, color: colors.muted }}>
              El jugador verá la invitación como notificación al entrar y registrará su cuenta con el código ya puesto.
            </p>
            <Select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as 'officer' | 'co_leader')} style={{ width: '100%', marginBottom: 14 }}>
              <option value="officer">🎖 Oficial — ver miembros/sanciones, notas, reportar</option>
              <option value="co_leader">⭐ Co-líder — además crear partidas, expulsar e invitar oficiales</option>
            </Select>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Button variant="ghost" onClick={() => setInviteTarget(null)}>Cancelar</Button>
              <Button onClick={inviteOfficer} disabled={busy}>{busy ? 'Generando…' : 'Generar invitación'}</Button>
            </div>
          </div>
        </div>
      )}

      {inviteResult && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }} onClick={() => setInviteResult(null)}>
          <div style={{ background: colors.card, border: `1px solid ${colors.border}`, borderRadius: 16, padding: 24, maxWidth: 480, width: '100%' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0, color: colors.text }}>✅ Invitación creada — {inviteResult.name}</h3>
            <p style={{ fontSize: 13, color: colors.muted }}>
              El jugador la verá como notificación. Código: <b style={{ color: colors.accent }}>{inviteResult.code}</b> (válido 7 días).
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Button variant="ghost" onClick={() => setInviteResult(null)}>Cerrar</Button>
              <Button onClick={() => { navigator.clipboard?.writeText(`https://alliancehub.app/registro/oficial?code=${inviteResult.code}`).catch(() => {}); showToast('Enlace copiado'); }}>📋 Copiar enlace</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
