import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { publicDb, getSessionToken } from '../../lib/api';
import { usePlayerSession } from '../../lib/playerSession';
import { useMatchTypes, type MatchType } from '../../lib/matchTypes';
import { colors, styles } from '../../theme';
import Button from '../../components/Button';
import Loader from '../../components/Loader';

/**
 * CreateMatchRequestPage — cualquier jugador registrado propone una partida
 * casual. La partida NO se crea directamente: queda como solicitud pendiente
 * que el staff aprueba desde /admin/partidas. Anti-spam: 1 pendiente por jugador.
 */
export default function CreateMatchRequestPage() {
  const { session, loading } = usePlayerSession();
  const { types, loading: typesLoading } = useMatchTypes();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [matchType, setMatchType] = useState('public_quick');
  const [maxPlayers, setMaxPlayers] = useState(10);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [mine, setMine] = useState<any[]>([]);

  const globalTypes = (types as MatchType[]).filter((t) => t.scope === 'global' && t.is_active);

  useEffect(() => {
    if (!session) return;
    (async () => {
      const { data } = await publicDb.rpc('player_my_match_requests', { p_token: getSessionToken() || '' });
      setMine((data as any[]) ?? []);
    })().catch(() => { /* noop */ });
  }, [session, done]);

  if (!loading && !session) return <Navigate to="/login" replace />;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (name.trim().length < 3) { setError('✖ El nombre debe tener al menos 3 caracteres.'); return; }
    setSubmitting(true);
    try {
      const { error: rpcErr } = await publicDb.rpc('player_create_match_request', {
        p_token: getSessionToken() || '',
        p_name: name.trim(),
        p_description: description.trim() || null,
        p_match_type: matchType,
        p_max_players: maxPlayers,
      });
      if (rpcErr) throw rpcErr;
      setDone(true);
    } catch (err: any) {
      setError('✖ ' + (err.message || 'No se pudo enviar la solicitud.'));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading || typesLoading) return <Loader />;

  const pendingMine = mine.filter((r) => r.status === 'pending');

  return (
    <div style={{ maxWidth: 640, margin: '40px auto', padding: '0 16px' }}>
      <div style={{ ...styles.card, padding: 32 }}>
        <h1 style={{ color: colors.text, marginTop: 0, fontSize: 24 }}>🎲 Proponer partida casual</h1>
        <p style={{ color: colors.muted, fontSize: 14 }}>
          Propón una partida pública para tu grupo. No se crea directamente: el staff la revisa
          y, al aprobarla, aparece en el lobby para que cualquiera se registre. Si nadie la revisa
          en 30 días, la solicitud se elimina sola.
        </p>

        {pendingMine.length > 0 && !done && (
          <div style={{ ...styles.card, background: 'rgba(255,193,7,0.08)', border: `1px solid ${colors.warning}`, marginBottom: 20, padding: 14 }}>
            <p style={{ color: '#ffd54f', margin: 0, fontSize: 13 }}>
              ⏳ Ya tienes una solicitud pendiente: <strong>{pendingMine[0].name}</strong>. Debes esperar a que el staff la revise antes de proponer otra.
            </p>
          </div>
        )}

        {done ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📨</div>
            <h2 style={{ color: colors.success, margin: 0 }}>Solicitud enviada</h2>
            <p style={{ color: colors.muted }}>
              Aparece ya en el lobby marcada como <em>pendiente de validación</em>. Cuando el staff la apruebe,
              la partida quedará abierta para inscripciones y tú quedarás registrado automáticamente.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <Button onClick={() => navigate('/partidas')}>Ver lobby</Button>
              <Button variant="ghost" onClick={() => navigate('/mi-espacio')}>Mi espacio</Button>
            </div>
          </div>
        ) : (
          <form onSubmit={onSubmit}>
            <label style={{ display: 'block', marginBottom: 14 }}>
              <span style={{ color: colors.muted, fontSize: 13 }}>Nombre de la partida *</span>
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required
                placeholder="Ej: Guerra de clanes — sábado 22:00" style={{ ...styles.input, width: '100%', marginTop: 4 }} />
            </label>
            <label style={{ display: 'block', marginBottom: 14 }}>
              <span style={{ color: colors.muted, fontSize: 13 }}>Descripción (opcional)</span>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} rows={4}
                placeholder="Reglas del grupo, horario, requisitos…" style={{ ...styles.input, width: '100%', marginTop: 4, resize: 'vertical' }} />
            </label>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <label style={{ flex: 1, minWidth: 180 }}>
                <span style={{ color: colors.muted, fontSize: 13 }}>Tipo de partida</span>
                <select value={matchType} onChange={(e) => setMatchType(e.target.value)} style={{ ...styles.input, width: '100%', marginTop: 4 }}>
                  {globalTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </label>
              <label style={{ width: 140 }}>
                <span style={{ color: colors.muted, fontSize: 13 }}>Máx. jugadores</span>
                <input type="number" min={2} max={500} value={maxPlayers} onChange={(e) => setMaxPlayers(Number(e.target.value))}
                  style={{ ...styles.input, width: '100%', marginTop: 4 }} />
              </label>
            </div>
            {error && <p style={{ color: colors.danger, marginTop: 12 }}>{error}</p>}
            <div style={{ marginTop: 20, display: 'flex', gap: 10 }}>
              <Button type="submit" disabled={submitting || pendingMine.length > 0}>
                {submitting ? 'Enviando…' : 'Enviar solicitud'}
              </Button>
              <Button variant="ghost" onClick={() => navigate('/partidas')}>Cancelar</Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
