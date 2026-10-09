import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { publicDb } from '../../lib/api';
import { colors, styles } from '../../theme';
import Button from '../../components/Button';

export interface Responsible {
  admin_user_id: string;
  display_name: string | null;
  role: string;
  tag: string | null;
  contact_discord: string | null;
  contact_phone: string | null;
  contact_email: string | null;
}

export interface StaffUser {
  id: string;
  display_name: string | null;
  role: string;
  tag: string | null;
}

const ROLE_LABELS: Record<string, string> = {
  superadmin: 'Super Admin',
  event_admin: 'Admin Eventos',
  moderator: 'Moderador',
  alliance_leader: 'Líder de Alianza',
};

export async function loadResponsibles(matchId: string): Promise<Responsible[]> {
  const { data } = await publicDb.from('match_responsibles')
    .select('admin_user_id, contact_discord, contact_phone, contact_email, admin_users!inner(display_name, role, alliance_id)')
    .eq('match_id', matchId)
    .order('sort_order');
  const rows = (data as {
    admin_user_id: string;
    contact_discord: string | null; contact_phone: string | null; contact_email: string | null;
    admin_users: { display_name: string | null; role: string; alliance_id: string | null } | { display_name: string | null; role: string; alliance_id: string | null }[];
  }[] | null) ?? [];
  const allianceIds = [...new Set(rows.map((r) => (Array.isArray(r.admin_users) ? r.admin_users[0] : r.admin_users).alliance_id).filter(Boolean))] as string[];
  const tags: Record<string, string> = {};
  if (allianceIds.length) {
    const { data: alli } = await publicDb.from('alliances').select('id, tag').in('id', allianceIds);
    ((alli as { id: string; tag: string }[] | null) ?? []).forEach((a) => { tags[a.id] = a.tag; });
  }
  return rows.map((r) => {
    const au = Array.isArray(r.admin_users) ? r.admin_users[0] : r.admin_users;
    return {
      admin_user_id: r.admin_user_id,
      display_name: au.display_name,
      role: au.role,
      tag: au.alliance_id ? (tags[au.alliance_id] ?? null) : null,
      contact_discord: r.contact_discord, contact_phone: r.contact_phone, contact_email: r.contact_email,
    };
  });
}

/** Ficha publica de contactos de los responsables de la partida (GamePage). */
export function ResponsiblesCard({ matchId }: { matchId: string }) {
  const [list, setList] = useState<Responsible[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadResponsibles(matchId).then((r) => { if (!cancelled) setList(r); });
    return () => { cancelled = true; };
  }, [matchId]);

  if (list === null) return null;
  if (list.length === 0) return null;
  return (
    <div style={{ marginBottom: 12 }}>
      <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 700, letterSpacing: 0.5, color: colors.muted }}>RESPONSABLES DE LA PARTIDA</p>
      {list.map((r) => (
        <div key={r.admin_user_id} style={{ marginBottom: 8, padding: 10, borderRadius: 8, background: colors.bg, border: `1px solid ${colors.border}` }}>
          <p style={{ margin: 0, fontSize: 13, color: colors.text }}>
            <strong>{r.display_name ?? 'Staff'}</strong>
            <span style={{ color: colors.muted, fontWeight: 400 }}> · {ROLE_LABELS[r.role] ?? r.role}{r.tag ? ` [${r.tag}]` : ''}</span>
          </p>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
            {r.contact_discord && (
              <button
                type="button"
                onClick={() => { navigator.clipboard?.writeText(r.contact_discord!).catch(() => {}); window.alert('Discord copiado: ' + r.contact_discord); }}
                style={{ ...chip, borderColor: colors.info, color: colors.info }}
                title="Copiar usuario de Discord"
              >🎮 {r.contact_discord}</button>
            )}
            {r.contact_phone && (
              <a href={'tel:' + r.contact_phone.replace(/\s/g, '')} style={{ ...chip, borderColor: colors.success, color: colors.success, textDecoration: 'none' }} title="Llamar">📞 {r.contact_phone}</a>
            )}
            {r.contact_email && (
              <a href={'mailto:' + r.contact_email} style={{ ...chip, borderColor: colors.warning, color: colors.warning, textDecoration: 'none' }} title="Enviar correo">✉️ {r.contact_email}</a>
            )}
            {!r.contact_discord && !r.contact_phone && !r.contact_email && (
              <span style={{ fontSize: 12, color: colors.muted }}>Sin contactos alternativos.</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

const chip: CSSProperties = {
  fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 20,
  border: '1px solid', background: 'transparent', cursor: 'pointer',
};

/**
 * Editor de responsables (solo staff, RLS lo refuerza): elige entre
 * admins/superadmins/lideres activos y pon los contactos alternativos de cada uno.
 */
export function ResponsiblesManager({ matchId, onSaved }: { matchId: string; onSaved?: (msg: string) => void }) {
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [picked, setPicked] = useState<Record<string, { discord: string; phone: string; email: string }>>({});
  const [busy, setBusy] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [{ data: au }, current] = await Promise.all([
      publicDb.from('admin_users')
        .select('id, display_name, role, alliance_id')
        .eq('status', 'active')
        .in('role', ['superadmin', 'event_admin', 'moderator', 'alliance_leader']),
      loadResponsibles(matchId),
    ]);
    const rows = (au as { id: string; display_name: string | null; role: string; alliance_id: string | null }[] | null) ?? [];
    const allianceIds = [...new Set(rows.map((r) => r.alliance_id).filter(Boolean))] as string[];
    const tags: Record<string, string> = {};
    if (allianceIds.length) {
      const { data: alli } = await publicDb.from('alliances').select('id, tag').in('id', allianceIds);
      ((alli as { id: string; tag: string }[] | null) ?? []).forEach((a) => { tags[a.id] = a.tag; });
    }
    setStaff(rows.map((r) => ({ id: r.id, display_name: r.display_name, role: r.role, tag: r.alliance_id ? (tags[r.alliance_id] ?? null) : null })));
    const map: Record<string, { discord: string; phone: string; email: string }> = {};
    current.forEach((c) => { map[c.admin_user_id] = { discord: c.contact_discord ?? '', phone: c.contact_phone ?? '', email: c.contact_email ?? '' }; });
    setPicked(map);
  }, [matchId]);

  useEffect(() => { load(); }, [load]);

  function toggle(id: string) {
    setPicked((p) => {
      const next = { ...p };
      if (next[id]) delete next[id];
      else next[id] = { discord: '', phone: '', email: '' };
      return next;
    });
  }

  async function save() {
    setBusy(true);
    const entries = Object.entries(picked);
    const { data: existing } = await publicDb.from('match_responsibles').select('admin_user_id').eq('match_id', matchId);
    const keep = new Set(entries.map(([id]) => id));
    const toDelete = (((existing as { admin_user_id: string }[] | null) ?? []).map((r) => r.admin_user_id)).filter((id) => !keep.has(id));
    let errorMsg: string | null = null;
    for (const id of toDelete) {
      const { error } = await publicDb.from('match_responsibles').delete().eq('match_id', matchId).eq('admin_user_id', id);
      if (error) errorMsg = error.message;
    }
    for (let i = 0; i < entries.length; i++) {
      const [id, c] = entries[i];
      const { error } = await publicDb.from('match_responsibles').upsert({
        match_id: matchId, admin_user_id: id,
        contact_discord: c.discord || null, contact_phone: c.phone || null, contact_email: c.email || null,
        sort_order: i,
      });
      if (error) errorMsg = error.message;
    }
    setBusy(false);
    const msg = errorMsg ? 'Error: ' + errorMsg : '✓ Responsables guardados';
    setSavedMsg(msg);
    onSaved?.(msg);
    setTimeout(() => setSavedMsg(null), 3000);
  }

  return (
    <div style={{ marginTop: 12, borderTop: `1px dashed ${colors.border}`, paddingTop: 12 }}>
      <p style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 700, color: colors.text }}>👤 Responsables de la partida</p>
      <p style={{ margin: '0 0 10px', fontSize: 12, color: colors.muted }}>
        Marca quién gestiona esta partida y qué contactos alternativos (Discord, teléfono, correo) verán los jugadores.
      </p>
      {staff.map((u) => {
        const sel = picked[u.id];
        return (
          <div key={u.id} style={{ marginBottom: 8, padding: 10, borderRadius: 8, background: colors.bg, border: `1px solid ${sel ? colors.info : colors.border}` }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={!!sel} onChange={() => toggle(u.id)} />
              <span style={{ fontSize: 13, color: colors.text }}>
                <strong>{u.display_name ?? 'Staff'}</strong>
                <span style={{ color: colors.muted, fontWeight: 400 }}> · {ROLE_LABELS[u.role] ?? u.role}{u.tag ? ` [${u.tag}]` : ''}</span>
              </span>
            </label>
            {sel && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 6, marginTop: 8 }}>
                <input value={sel.discord} onChange={(e) => setPicked((p) => ({ ...p, [u.id]: { ...p[u.id], discord: e.target.value } }))}
                  placeholder="Discord (usuario#0000 o @usuario)" style={{ ...styles.input, marginBottom: 0, fontSize: 12 }} />
                <input value={sel.phone} onChange={(e) => setPicked((p) => ({ ...p, [u.id]: { ...p[u.id], phone: e.target.value } }))}
                  placeholder="Teléfono (opcional)" style={{ ...styles.input, marginBottom: 0, fontSize: 12 }} />
                <input value={sel.email} onChange={(e) => setPicked((p) => ({ ...p, [u.id]: { ...p[u.id], email: e.target.value } }))}
                  placeholder="Correo (opcional)" style={{ ...styles.input, marginBottom: 0, fontSize: 12 }} />
              </div>
            )}
          </div>
        );
      })}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
        <Button disabled={busy} onClick={save} style={{ padding: '6px 14px', fontSize: 13 }}>Guardar responsables</Button>
        {savedMsg && <span style={{ fontSize: 12, color: savedMsg.startsWith('✓') ? colors.success : colors.danger }}>{savedMsg}</span>}
      </div>
    </div>
  );
}
