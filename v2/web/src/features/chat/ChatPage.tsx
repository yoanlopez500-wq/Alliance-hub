import { useCallback, useEffect, useRef, useState } from 'react';
import { publicDb } from '../../lib/api';
import { colors, styles } from '../../theme';
import Loader from '../../components/Loader';
import Button from '../../components/Button';

const LS_DM = 'ah2_chat_dms';
const MAX_LOCAL = 200;

const ROLE_LEVELS: Record<string, number> = {
  superadmin: 5, event_admin: 4, alliance_leader: 3, moderator: 2, co_leader: 2, officer: 1,
};

const ROLE_NAMES: Record<string, string> = {
  superadmin: 'Super Admin', event_admin: 'Admin Eventos', alliance_leader: 'Lider',
  co_leader: 'Co-Lider', officer: 'Oficial', moderator: 'Moderador',
};

interface Me { id: string; name: string; role: string; alliance: string }
interface Admin { id: string; role: string; display_name: string | null; alliance: { name: string; tag: string } | null }
interface Channel { id: string; name: string; type: string | null; allowed_roles: string[] | null; min_level: number | null }
interface Msg {
  id: string; dbId?: number; dmId?: number; sid: string; name: string; role: string | null;
  text: string; type: string; ts: string; persisted: boolean; failed?: boolean;
}

function roleLevel(r: string | null | undefined): number { return (r && ROLE_LEVELS[r]) || 0; }
function fmtRole(r: string | null | undefined) { return (r && ROLE_NAMES[r]) || r || ''; }
function fmtTime(ts: string) { return new Date(ts).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }); }
function fmtDateSep(ts: string) {
  const d = new Date(ts), n = new Date();
  if (d.toDateString() === n.toDateString()) return 'Hoy';
  const y = new Date(); y.setDate(y.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'Ayer';
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}
const isDM = (ch: string) => ch.indexOf('dm-') === 0;
const dmOtherId = (ch: string) => ch.replace('dm-', '');
const broadcastChan = (ch: string) => 'rt_' + ch.replace(/[^a-zA-Z0-9_-]/g, '_');

/** ChatPage — puerto de chat.js: chat admin en tiempo real (canales + DMs). */
export default function ChatPage() {
  const [state, setState] = useState<'loading' | 'denied' | 'ready'>('loading');
  const [me, setMe] = useState<Me | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [dms, setDms] = useState<{ id: string; lastTs: string | null; unread: number }[]>([]);
  const [curChan, setCurChan] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [conn, setConn] = useState<'online' | 'connecting' | 'offline'>('connecting');
  const [typing, setTyping] = useState('');
  const [input, setInput] = useState('');
  const [dmSearchOpen, setDmSearchOpen] = useState(false);
  const [dmQuery, setDmQuery] = useState('');
  const [report, setReport] = useState<{ id: number; sender: string } | null>(null);
  const [reportReason, setReportReason] = useState('spam');
  const [toast, setToast] = useState<{ text: string; tone: string } | null>(null);

  const msgCache = useRef<Map<string, Msg[]>>(new Map());
  const rtSub = useRef<any>(null);
  const pgSub = useRef<any>(null);
  const dmSub = useRef<any>(null);
  const typingTimer = useRef<any>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const showToast = useCallback((text: string, tone = 'info') => {
    setToast({ text, tone });
    setTimeout(() => setToast(null), 2500);
  }, []);

  const adminById = useCallback((id: string) => admins.find((a) => a.id === id), [admins]);

  // ---- Inicializacion: sesion admin + canales + admins + DMs ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: sessionData } = await publicDb.auth.getSession();
      const session = sessionData.session;
      if (!session) { if (!cancelled) setState('denied'); return; }
      const { data: adm } = await publicDb.from('admin_users').select('*')
        .eq('id', session.user.id).eq('status', 'active').maybeSingle();
      if (!adm || roleLevel((adm as any).role) < 1) { if (!cancelled) setState('denied'); return; }

      let allianceName = '';
      if ((adm as any).alliance_id) {
        const { data: alli } = await publicDb.from('alliances').select('name').eq('id', (adm as any).alliance_id).single();
        allianceName = (alli as any)?.name ?? '';
      }
      const meObj: Me = {
        id: session.user.id,
        name: (adm as any).display_name || session.user.email?.split('@')[0] || 'Admin',
        role: (adm as any).role,
        alliance: allianceName,
      };
      if (cancelled) return;
      setMe(meObj);

      const { data: chans } = await publicDb.from('chat_channels').select('*')
        .eq('is_active', true).order('name', { ascending: true });
      const visible = ((chans || []) as Channel[]).filter((c) => {
        if (c.allowed_roles && c.allowed_roles.length && c.allowed_roles.indexOf(meObj.role) === -1) return false;
        if (c.min_level != null && roleLevel(meObj.role) < c.min_level) return false;
        return true;
      });
      setChannels(visible);

      try {
        const { data: admRows } = await publicDb.from('admin_users').select('*').eq('status', 'active').neq('id', meObj.id);
        const ids = ((admRows || []) as any[]).map((a) => a.alliance_id).filter(Boolean);
        let alliMap: Record<number, any> = {};
        if (ids.length) {
          const { data: allis } = await publicDb.from('alliances').select('id, name, tag').in('id', ids);
          (allis || []).forEach((a: any) => { alliMap[a.id] = a; });
        }
        setAdmins(((admRows || []) as any[]).map((a: any) => ({
          id: a.id, role: a.role, display_name: a.display_name,
          alliance: a.alliance_id && alliMap[a.alliance_id] ? alliMap[a.alliance_id] : null,
        })));
      } catch { setAdmins([]); }

      try {
        const { data: dmRows } = await publicDb.from('direct_messages').select('*')
          .or(`sender_admin_id.eq.${meObj.id},recipient_admin_id.eq.${meObj.id}`)
          .order('created_at', { ascending: false }).limit(500);
        const map: Record<string, { id: string; lastTs: string | null; unread: number }> = {};
        (dmRows || []).forEach((row: any) => {
          const other = row.sender_admin_id === meObj.id ? row.recipient_admin_id : row.sender_admin_id;
          if (!map[other]) map[other] = { id: other, lastTs: null, unread: 0 };
          if (!map[other].lastTs || row.created_at > map[other].lastTs!) map[other].lastTs = row.created_at;
          if (row.recipient_admin_id === meObj.id && !row.read_at) map[other].unread++;
        });
        setDms(Object.values(map).sort((a, b) => (a.lastTs! < b.lastTs! ? 1 : -1)));
      } catch (e) { console.error('[Chat] DMs:', e); }

      // Realtime DMs entrantes
      dmSub.current = publicDb.channel('dm_inbox_' + meObj.id)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'direct_messages', filter: `recipient_admin_id=eq.${meObj.id}` }, (payload: any) => {
          const row = payload.new;
          const other = row.sender_admin_id;
          setDms((prev) => {
            const next = prev.filter((d) => d.id !== other);
            const conv = prev.find((d) => d.id === other);
            return [{ id: other, lastTs: row.created_at, unread: (conv?.unread || 0) + 1 }, ...next];
          });
        })
        .subscribe();

      setState('ready');
      if (visible.length) setCurChan(visible[0].id);
    })();
    return () => {
      cancelled = true;
      [rtSub, pgSub, dmSub].forEach((s) => { try { s.current?.unsubscribe(); } catch { /* noop */ } });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Historial al cambiar de canal ----
  useEffect(() => {
    if (!state || state !== 'ready' || !curChan || !me) return;
    let cancelled = false;
    (async () => {
      if (isDM(curChan)) {
        const oid = dmOtherId(curChan);
        const { data: rows } = await publicDb.from('direct_messages').select('*')
          .or(`and(sender_admin_id.eq.${me.id},recipient_admin_id.eq.${oid}),and(sender_admin_id.eq.${oid},recipient_admin_id.eq.${me.id})`)
          .order('created_at', { ascending: true }).limit(50);
        if (cancelled) return;
        const msgs: Msg[] = (rows || []).map((row: any) => ({
          id: 'dm_' + row.id, dmId: row.id, sid: row.sender_admin_id,
          name: row.sender_admin_id === me.id ? me.name : (adminById(row.sender_admin_id)?.display_name ?? 'Admin'),
          role: row.sender_admin_id === me.id ? me.role : adminById(row.sender_admin_id)?.role ?? null,
          text: row.message || row.body || row.content || '', type: 'text', ts: row.created_at, persisted: true,
        }));
        msgCache.current.set(curChan, msgs.slice(-MAX_LOCAL));
        setMessages(msgs);
        publicDb.from('direct_messages').update({ read_at: new Date().toISOString() })
          .eq('sender_admin_id', oid).eq('recipient_admin_id', me.id).is('read_at', null)
          .then(() => setDms((prev) => prev.map((d) => d.id === oid ? { ...d, unread: 0 } : d)));
      } else {
        const { data: rows } = await publicDb.from('chat_messages').select('*')
          .eq('channel', curChan).order('created_at', { ascending: true }).limit(30);
        if (cancelled) return;
        const msgs: Msg[] = (rows || []).map((row: any) => ({
          id: 'db_' + row.id, dbId: row.id, sid: row.sender_admin_id, name: row.sender_name,
          role: row.sender_role, text: row.message, type: row.message_type || 'text', ts: row.created_at, persisted: true,
        }));
        msgCache.current.set(curChan, msgs.slice(-MAX_LOCAL));
        setMessages(msgs);
      }
      setTimeout(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }); }, 0);
    })();
    return () => { cancelled = true; };
  }, [curChan, state, me?.id]);

  // ---- Realtime canal (broadcast typing + postgres_changes) ----
  useEffect(() => {
    if (!me || !curChan || isDM(curChan)) return;
    setConn('connecting');
    const bc = broadcastChan(curChan);
    const rt = publicDb.channel(bc, { config: { broadcast: { self: false } } });
    rt.on('broadcast', { event: 'typing' }, (p: any) => {
      if (p.payload.sid !== me.id) {
        setTyping(`${p.payload.name} esta escribiendo...`);
        clearTimeout(typingTimer.current);
        typingTimer.current = setTimeout(() => setTyping(''), 3000);
      }
    }).subscribe((st: string) => {
      if (st === 'SUBSCRIBED') setConn('online');
      else if (st === 'CLOSED' || st === 'CHANNEL_ERROR') setConn('offline');
      else setConn('connecting');
    });
    rtSub.current = rt;

    const pg = publicDb.channel('pg_' + bc)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `channel=eq.${curChan}` }, (payload: any) => {
        const row = payload.new;
        const msg: Msg = {
          id: 'db_' + row.id, dbId: row.id, sid: row.sender_admin_id, name: row.sender_name,
          role: row.sender_role, text: row.message, type: row.message_type || 'text', ts: row.created_at, persisted: true,
        };
        setMessages((prev) => {
          const cached = msgCache.current.get(curChan) || [];
          if (msg.sid === me.id) {
            const pending = cached.find((m) => m.sid === me.id && !m.persisted && m.text === msg.text);
            if (pending) {
              pending.id = msg.id; pending.dbId = msg.dbId; pending.persisted = true;
              msgCache.current.set(curChan, [...cached]);
              return [...cached];
            }
          }
          if (cached.some((m) => m.id === msg.id)) return prev;
          const next = [...cached, msg].slice(-MAX_LOCAL);
          msgCache.current.set(curChan, next);
          return next;
        });
      })
      .subscribe();
    pgSub.current = pg;

    return () => {
      try { rt.unsubscribe(); } catch { /* noop */ }
      try { pg.unsubscribe(); } catch { /* noop */ }
      rtSub.current = null; pgSub.current = null;
      setTyping('');
    };
  }, [curChan, me]);

  // ---- Auto-scroll ----
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    if (near) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const send = useCallback(async () => {
    if (!me || !curChan) return;
    const txt = input.trim();
    if (!txt) return;
    setInput('');
    const tempId = 'pending_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);

    if (isDM(curChan)) {
      const oid = dmOtherId(curChan);
      const temp: Msg = { id: tempId, sid: me.id, name: me.name, role: me.role, text: txt, type: 'text', ts: new Date().toISOString(), persisted: false };
      msgCache.current.set(curChan, [...(msgCache.current.get(curChan) || []), temp].slice(-MAX_LOCAL));
      setMessages((prev) => [...prev, temp]);
      try {
        const { data: inserted, error } = await publicDb.from('direct_messages')
          .insert({ sender_admin_id: me.id, sender_name: me.name, recipient_admin_id: oid, message: txt }).select().single();
        if (error) throw error;
        setMessages((prev) => prev.map((m) => m.id === tempId ? { ...m, id: 'dm_' + (inserted as any).id, dmId: (inserted as any).id, persisted: true } : m));
      } catch (e) {
        console.error('Error enviando DM:', e);
        setMessages((prev) => prev.map((m) => m.id === tempId ? { ...m, failed: true } : m));
      }
      return;
    }

    const chan = channels.find((c) => c.id === curChan);
    if (chan && chan.allowed_roles && chan.allowed_roles.length && !chan.allowed_roles.includes(me.role)) {
      showToast('No tienes permiso para escribir en este canal', 'warning');
      return;
    }
    if (chan && chan.min_level != null && roleLevel(me.role) < chan.min_level) {
      showToast('No tienes permiso para escribir en este canal', 'warning');
      return;
    }

    const temp: Msg = { id: tempId, sid: me.id, name: me.name, role: me.role, text: txt, type: 'text', ts: new Date().toISOString(), persisted: false };
    msgCache.current.set(curChan, [...(msgCache.current.get(curChan) || []), temp].slice(-MAX_LOCAL));
    setMessages((prev) => [...prev, temp]);
    try {
      const { data: inserted, error } = await publicDb.from('chat_messages')
        .insert({ channel: curChan, sender_admin_id: me.id, sender_name: me.name, sender_role: me.role, message: txt, message_type: 'text' }).select().single();
      if (error) throw error;
      const newId = 'db_' + (inserted as any).id;
      const cached = msgCache.current.get(curChan) || [];
      const m = cached.find((x) => x.id === tempId);
      if (m) { m.id = newId; m.dbId = (inserted as any).id; m.persisted = true; msgCache.current.set(curChan, [...cached]); }
      setMessages((prev) => prev.map((x) => x.id === tempId ? { ...x, id: newId, dbId: (inserted as any).id, persisted: true } : x));
    } catch (e) {
      console.error('Error persisting message:', e);
      setMessages((prev) => prev.map((x) => x.id === tempId ? { ...x, failed: true } : x));
    }
  }, [me, curChan, input, channels, showToast]);

  function retry(msg: Msg) {
    setMessages((prev) => prev.filter((m) => m.id !== msg.id));
    const cached = msgCache.current.get(curChan || '') || [];
    msgCache.current.set(curChan || '', cached.filter((m) => m.id !== msg.id));
    setInput(msg.text);
  }

  async function submitReport() {
    if (!report || !me || !curChan) return;
    try {
      const { error } = await publicDb.from('chat_reports').insert({
        channel: curChan, reporter_id: me.id, reporter_name: me.name,
        reason: reportReason, reported_message_id: report.id,
      });
      if (error) throw error;
      showToast('Reporte enviado', 'success');
      setReport(null);
    } catch (e) {
      console.error('Error al reportar:', e);
      showToast('Error al reportar', 'error');
    }
  }

  function startDM(aid: string) {
    if (!dms.some((d) => d.id === aid)) setDms((prev) => [{ id: aid, lastTs: null, unread: 0 }, ...prev]);
    setDmSearchOpen(false);
    setCurChan('dm-' + aid);
  }

  if (state === 'loading') return <Loader label="Cargando chat..." />;
  if (state === 'denied') {
    return (
      <div style={{ maxWidth: 520, margin: '80px auto', textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🔒</div>
        <h2 style={{ color: colors.text }}>Acceso restringido</h2>
        <p style={{ color: colors.muted }}>El chat es solo para el equipo administrativo. Inicia sesion con una cuenta de admin.</p>
      </div>
    );
  }

  const curChannel = channels.find((c) => c.id === curChan);
  const curAdmin = curChan && isDM(curChan) ? adminById(dmOtherId(curChan)) : null;
  const CONN_META = { online: { color: colors.success, label: 'En linea' }, connecting: { color: colors.warning, label: 'Conectando...' }, offline: { color: colors.danger, label: 'Desconectado' } } as const;
  const connMeta = CONN_META[conn];

  const dmResults = dmQuery.trim()
    ? admins.filter((a) =>
        (a.display_name || '').toLowerCase().includes(dmQuery.toLowerCase()) ||
        (a.alliance?.name || '').toLowerCase().includes(dmQuery.toLowerCase()))
    : [];

  const sidebarBtn: React.CSSProperties = {
    width: '100%', textAlign: 'left', padding: '10px 12px', borderRadius: 8, border: 'none',
    background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
    color: colors.text, fontSize: 13,
  };

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 64px)', background: colors.bg }}>
      {/* Sidebar */}
      <div style={{ width: 260, borderRight: `1px solid ${colors.border}`, background: colors.card, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        <div style={{ padding: 12, borderBottom: `1px solid ${colors.border}` }}>
          <div style={{ fontSize: 12, color: colors.muted }}>{ROLE_NAMES[me!.role]}{me!.alliance ? ` - ${me!.alliance}` : ''}</div>
          <button onClick={() => setDmSearchOpen(true)} style={{ ...styles.btnGhost, width: '100%', marginTop: 8, padding: '6px 10px', fontSize: 12 }}>
            ✉ Nuevo mensaje directo
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
          <p style={{ fontSize: 10, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1, margin: '8px 4px 4px' }}>Canales</p>
          {channels.length === 0 && <p style={{ fontSize: 11, color: colors.muted, padding: '0 8px' }}>Sin canales</p>}
          {channels.map((c) => (
            <button key={c.id} onClick={() => setCurChan(c.id)} style={{
              ...sidebarBtn,
              background: curChan === c.id ? colors.cardAlt : 'none',
              outline: curChan === c.id ? `1px solid ${colors.border}` : 'none',
            }}>
              <span style={{ width: 30, height: 30, borderRadius: '50%', background: colors.border, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, flexShrink: 0 }}>
                {(c.name || c.id).charAt(0).toUpperCase()}
              </span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name || c.id}</span>
                <span style={{ display: 'block', fontSize: 10, color: colors.muted }}>{c.type || ''}</span>
              </span>
            </button>
          ))}
          <p style={{ fontSize: 10, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1, margin: '12px 4px 4px' }}>Mensajes directos</p>
          {dms.length === 0 && <p style={{ fontSize: 11, color: colors.muted, padding: '0 8px' }}>Sin conversaciones</p>}
          {dms.map((dm) => {
            const a = adminById(dm.id);
            return (
              <button key={dm.id} onClick={() => setCurChan('dm-' + dm.id)} style={{
                ...sidebarBtn,
                background: curChan === 'dm-' + dm.id ? colors.cardAlt : 'none',
                outline: curChan === 'dm-' + dm.id ? `1px solid ${colors.border}` : 'none',
              }}>
                <span style={{ width: 30, height: 30, borderRadius: '50%', background: colors.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, flexShrink: 0 }}>💬</span>
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ display: 'block', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {a?.display_name || 'Desconocido'}{a?.alliance ? ` [${a.alliance.tag}]` : ''}
                  </span>
                  <span style={{ display: 'block', fontSize: 10, color: colors.muted }}>{a ? fmtRole(a.role) : ''}</span>
                </span>
                {dm.unread > 0 && (
                  <span style={{ fontSize: 10, background: colors.accent, color: colors.bg, fontWeight: 700, borderRadius: 10, padding: '1px 6px' }}>{dm.unread}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div style={{ padding: '10px 16px', borderBottom: `1px solid ${colors.border}`, display: 'flex', alignItems: 'center', gap: 10 }}>
          <strong style={{ color: colors.text }}>
            {curChan && isDM(curChan) ? `💬 ${curAdmin?.display_name || 'Directo'}` : curChannel?.name || curChan || ''}
          </strong>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: colors.muted }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: connMeta.color }} />
            {curChan && isDM(curChan) ? (curAdmin ? fmtRole(curAdmin.role) + (curAdmin.alliance ? ` - ${curAdmin.alliance.name}` : '') : 'Privado') : connMeta.label}
          </span>
          <span style={{ fontSize: 11, color: colors.muted, marginLeft: 'auto', minHeight: 14 }}>{typing}</span>
        </div>

        <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          {messages.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 0', color: colors.muted }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>💬</div>
              <p style={{ fontSize: 13 }}>Sin mensajes. Escribe algo!</p>
            </div>
          ) : (() => {
            const out: React.ReactNode[] = [];
            let lastD: string | null = null;
            messages.forEach((m) => {
              const cd = new Date(m.ts).toDateString();
              if (lastD !== cd) {
                out.push(
                  <div key={'sep_' + m.id} style={{ display: 'flex', justifyContent: 'center', margin: '12px 0' }}>
                    <span style={{ fontSize: 10, color: colors.muted, background: colors.card, border: `1px solid ${colors.border}`, padding: '3px 12px', borderRadius: 20 }}>{fmtDateSep(m.ts)}</span>
                  </div>
                );
                lastD = cd;
              }
              if (m.type === 'sys') {
                out.push(
                  <div key={m.id} style={{ display: 'flex', justifyContent: 'center', margin: '8px 0' }}>
                    <span style={{ fontSize: 11, color: colors.muted, background: colors.cardAlt, padding: '3px 12px', borderRadius: 20 }}>{m.text}</span>
                  </div>
                );
                return;
              }
              const isMeMsg = m.sid === me!.id;
              out.push(
                <div key={m.id} style={{ display: 'flex', justifyContent: isMeMsg ? 'flex-end' : 'flex-start', marginBottom: 6 }}>
                  <div style={{
                    maxWidth: '75%', borderRadius: 14, padding: '10px 14px',
                    background: isMeMsg ? 'rgba(255,143,0,0.12)' : colors.cardAlt,
                    border: `1px solid ${m.failed ? colors.danger : colors.border}`,
                    opacity: m.persisted ? 1 : 0.6,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 3 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: isMeMsg ? colors.accent : colors.muted }}>{m.name}</span>
                      {m.role && <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 4, background: 'rgba(255,255,255,0.08)', color: colors.muted }}>{fmtRole(m.role)}</span>}
                      <span style={{ fontSize: 10, color: colors.muted }}>{fmtTime(m.ts)}</span>
                      {!m.persisted && !m.failed && <span style={{ fontSize: 10, color: colors.muted }}>⏳</span>}
                      {m.failed && (
                        <button onClick={() => retry(m)} style={{ fontSize: 10, background: 'none', border: 'none', color: colors.danger, cursor: 'pointer', textDecoration: 'underline' }}>
                          Reintentar
                        </button>
                      )}
                      {!isMeMsg && m.dbId && (
                        <button onClick={() => setReport({ id: m.dbId!, sender: m.name })} title="Reportar mensaje" style={{ fontSize: 10, background: 'none', border: 'none', cursor: 'pointer', color: colors.danger }}>
                          🚩
                        </button>
                      )}
                    </div>
                    <div style={{ fontSize: 13, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: colors.text, lineHeight: 1.5 }}>{m.text}</div>
                  </div>
                </div>
              );
            });
            return out;
          })()}
        </div>

        <div style={{ padding: 12, borderTop: `1px solid ${colors.border}`, display: 'flex', gap: 8 }}>
          <input
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              if (rtSub.current && curChan && !isDM(curChan)) rtSub.current.send({ type: 'broadcast', event: 'typing', payload: { sid: me!.id, name: me!.name } });
            }}
            onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
            placeholder={curChan ? 'Escribe un mensaje...' : 'Selecciona un canal'}
            disabled={!curChan}
            style={{ ...styles.input, marginBottom: 0, flex: 1 }}
          />
          <Button onClick={send} disabled={!curChan || !input.trim()}>Enviar</Button>
        </div>
      </div>

      {/* DM search modal */}
      {dmSearchOpen && (
        <div onClick={() => setDmSearchOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ ...styles.card, width: 360, maxHeight: '70vh', display: 'flex', flexDirection: 'column' }}>
            <h3 style={{ margin: '0 0 10px', color: colors.text }}>Nuevo mensaje directo</h3>
            <input autoFocus value={dmQuery} onChange={(e) => setDmQuery(e.target.value)} placeholder="Buscar por nombre o alianza..." style={{ ...styles.input }} />
            <div style={{ overflowY: 'auto' }}>
              {dmResults.length === 0 && dmQuery.trim() && <p style={{ color: colors.muted, fontSize: 13, textAlign: 'center' }}>Sin resultados</p>}
              {dmResults.map((a) => (
                <button key={a.id} onClick={() => startDM(a.id)} style={{ ...sidebarBtn }}>
                  <span style={{ width: 32, height: 32, borderRadius: '50%', background: colors.cardAlt, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>👤</span>
                  <span>
                    <span style={{ display: 'block', fontSize: 13, fontWeight: 600 }}>{a.display_name || 'Admin'}{a.alliance ? ` [${a.alliance.tag}]` : ''}</span>
                    <span style={{ display: 'block', fontSize: 11, color: colors.muted }}>{fmtRole(a.role)}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Report modal */}
      {report && (
        <div onClick={() => setReport(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ ...styles.card, width: 340 }}>
            <h3 style={{ margin: '0 0 8px', color: colors.text }}>🚩 Reportar mensaje</h3>
            <p style={{ fontSize: 13, color: colors.muted }}>De: <strong style={{ color: colors.text }}>{report.sender}</strong></p>
            <select value={reportReason} onChange={(e) => setReportReason(e.target.value)} style={{ ...styles.input }}>
              <option value="spam">Spam</option>
              <option value="insultos">Insultos / toxicidad</option>
              <option value="contenido">Contenido inapropiado</option>
              <option value="otro">Otro</option>
            </select>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button onClick={submitReport}>Enviar reporte</Button>
              <Button variant="ghost" onClick={() => setReport(null)}>Cancelar</Button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div style={{
          position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)',
          padding: '10px 18px', borderRadius: 8, fontSize: 13, zIndex: 60,
          background: toast.tone === 'success' ? colors.success : toast.tone === 'error' ? colors.danger : toast.tone === 'warning' ? colors.warning : colors.info,
          color: colors.bg, fontWeight: 600,
        }}>{toast.text}</div>
      )}
    </div>
  );
}
