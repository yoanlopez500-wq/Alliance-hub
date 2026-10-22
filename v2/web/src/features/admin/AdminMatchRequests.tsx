import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { publicDb } from '../../lib/api';
import { colors, styles } from '../../theme';
import { formatDate, badgeStyle } from '../../lib/format';
import { MatchTypeBadge } from '../../lib/matchTypes';
import Button from '../../components/Button';
import Loader from '../../components/Loader';

type Request = {
  id: string; requester_id: number; name: string; description: string | null;
  match_type: string; max_players: number; status: string; admin_notes: string | null;
  match_id: string | null; created_at: string;
};

/**
 * Solicitudes de partidas casuales (match_requests). Se monta DENTRO de
 * AdminMatchesPage ("ahi mismo donde se crean las partidas"). El staff aprueba
 * (crea la partida real y auto-registra al solicitante) o rechaza con motivo.
 */
export default function AdminMatchRequests() {
  const [requests, setRequests] = useState<Request[] | null>(null);
  const [usernames, setUsernames] = useState<Map<number, string>>(new Map());
  const [busy, setBusy] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [approvedLink, setApprovedLink] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRequests(null);
    const { data, error: e } = await publicDb.from('match_requests')
      .select('*').eq('status', 'pending').order('created_at', { ascending: false });
    if (e) { setRequests([]); return; }
    const list = (data as Request[]) ?? [];
    setRequests(list);
    // Nombres de los solicitantes
    const ids = [...new Set(list.map((r) => r.requester_id))];
    if (ids.length) {
      const { data: players } = await publicDb.from('players').select('id, current_username').in('id', ids);
      setUsernames(new Map(((players as { id: number; current_username: string }[] | null) ?? []).map((p) => [p.id, p.current_username])));
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function approve(id: string) {
    setBusy(id); setError('');
    try {
      const { data: matchId, error: e } = await publicDb.rpc('approve_match_request', { p_request_id: id });
      if (e) throw e;
      await load();
      if (matchId) setApprovedLink(`/admin/partida?id=${matchId}`);
    } catch (err: any) {
      setError('✖ ' + (err.message || 'Error al aprobar'));
    } finally {
      setBusy(null);
    }
  }

  async function reject(id: string) {
    setBusy(id); setError('');
    try {
      const { error: e } = await publicDb.rpc('reject_match_request', { p_request_id: id, p_reason: reason.trim() || null });
      if (e) throw e;
      setRejecting(null); setReason('');
      await load();
    } catch (err: any) {
      setError('✖ ' + (err.message || 'Error al rechazar'));
    } finally {
      setBusy(null);
    }
  }

  if (!requests) return <Loader />;
  if (requests.length === 0) return null;

  return (
    <div style={{ ...styles.card, marginBottom: 20 }}>
      <h2 style={{ color: colors.text, margin: '0 0 4px', fontSize: 18 }}>📋 Solicitudes de partidas casuales</h2>
      <p style={{ color: colors.muted, fontSize: 13, margin: '0 0 14px' }}>
        {requests.length} pendiente{requests.length !== 1 ? 's' : ''}. Al aprobar se crea la partida
        (abierta a inscripciones) y el solicitante queda registrado. Las pendientes de más de 30 días se eliminan solas.
      </p>
      {approvedLink && (
        <p style={{ color: colors.success, margin: '0 0 8px' }}>
          ✓ Partida creada: <Link to={approvedLink} style={{ color: colors.accent }}>abrir ficha de la partida</Link>
        </p>
      )}
      {error && <p style={{ color: colors.danger, margin: '0 0 8px' }}>{error}</p>}
      {requests.map((r) => (
        <div key={r.id} style={{ borderTop: `1px solid ${colors.border}`, padding: '12px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                <MatchTypeBadge typeId={r.match_type} />
                <span style={badgeStyle('rgba(79,195,247,0.15)', colors.info)}>👥 Max {r.max_players}</span>
              </div>
              <h3 style={{ margin: '0 0 4px', color: colors.text }}>{r.name}</h3>
              {r.description && <p style={{ margin: '0 0 6px', color: colors.muted, fontSize: 13 }}>{r.description}</p>}
              <p style={{ margin: 0, fontSize: 12, color: colors.muted }}>
                Propuesta por <Link to={`/jugador/${r.requester_id}`} style={{ color: colors.accent }}>{usernames.get(r.requester_id) ?? `Jugador ${r.requester_id}`}</Link>
                {' '}· {formatDate(r.created_at)}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Button onClick={() => approve(r.id)} disabled={busy === r.id}>{busy === r.id ? '…' : '✓ Aprobar y crear'}</Button>
              {rejecting === r.id ? (
                <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input placeholder="Motivo (opcional)" value={reason} onChange={(e) => setReason(e.target.value)}
                    style={{ ...styles.input, width: 180, marginBottom: 0 }} />
                  <Button variant="danger" onClick={() => reject(r.id)} disabled={busy === r.id}>Rechazar</Button>
                  <Button variant="ghost" onClick={() => setRejecting(null)}>X</Button>
                </span>
              ) : (
                <Button variant="ghost" onClick={() => { setRejecting(r.id); setReason(''); }}>✖ Rechazar</Button>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
