import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { publicDb, getSessionToken } from '../../lib/api';
import { usePlayerSession, getStoredPlayerName } from '../../lib/playerSession';
import { getSanctionSummary, hasRuleConsent, setRuleConsent, type SanctionSummary } from '../../lib/sanctions';
import { colors, styles } from '../../theme';
import Button from '../../components/Button';
import Loader from '../../components/Loader';
import PushToggle from '../../components/PushToggle';

interface MatchInfo {
  id: string;
  name: string;
  status: string;
  match_type: string;
  game_id: string | null;
  password: string | null;
  requires_approval: boolean;
  alliance_id: string | null;
  alliance_name?: string;
}

type RegStatus = 'confirmed' | 'approved' | 'pending' | 'rejected' | null;

/** RegisterPage — puerto de register/index.js (registro de jugador a partida). */
export default function RegisterPage() {
  const { session, loading } = usePlayerSession();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const matchId = params.get('match');

  const [match, setMatch] = useState<MatchInfo | null>(null);
  const [regStatus, setRegStatus] = useState<RegStatus>(null);
  const [sanction, setSanction] = useState<SanctionSummary | null>(null);
  const [showCredentials, setShowCredentials] = useState(false);
  const [consentOpen, setConsentOpen] = useState(false);
  const [consentChecked, setConsentChecked] = useState(false);
  const [consentScrolled, setConsentScrolled] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);

  const playerId = session?.playerId ?? null;
  const displayName = getStoredPlayerName() || (playerId ? 'Jugador ' + playerId : '');

  useEffect(() => {
    if (loading || !playerId || !matchId) return;
    (async () => {
      try {
        // Chequeo de sanción
        const { data: player } = await publicDb.from('players')
          .select('status, banned_until, suspended_until, suspension_reason')
          .eq('id', playerId).maybeSingle();
        const summary = getSanctionSummary(player);
        setSanction(summary);

        if (summary.isSanctioned) { setPageLoading(false); return; }

        // Registro existente
        const { data: reg } = await publicDb.from('match_registrations')
          .select('status')
          .eq('match_id', matchId)
          .eq('player_id', playerId)
          .maybeSingle();
        const st = (reg as { status: RegStatus } | null)?.status ?? null;
        setRegStatus(st);

        // Datos de la partida
        const { data: m } = await publicDb.from('matches').select('*').eq('id', matchId).maybeSingle();
        if (m) {
          const mi = m as MatchInfo;
          if (mi.alliance_id) {
            const { data: alli } = await publicDb.from('alliances').select('name').eq('id', mi.alliance_id).maybeSingle();
            mi.alliance_name = (alli as { name: string } | null)?.name;
          }
          setMatch(mi);
          // Credenciales si ya está aprobado/confirmado
          if (st === 'confirmed' || st === 'approved') {
            if (!mi.requires_approval || st === 'approved' || st === 'confirmed') {
              if (hasRuleConsent(playerId, matchId)) setShowCredentials(true);
              else setConsentOpen(true);
            }
          }
        }
      } catch (e) {
        console.error('[Register]', e);
        setError('Error cargando la información de la partida.');
      } finally {
        setPageLoading(false);
      }
    })();
  }, [loading, playerId, matchId]);

  if (!matchId) return <Navigate to="/" replace />;
  if (!loading && !session) return <Navigate to="/login" replace />;

  async function doRegister() {
    if (!playerId || !matchId) return;
    setSubmitting(true);
    setError('');
    try {
      const { data: regStatus, error: rpcErr } = await publicDb.rpc('player_register_match', {
        p_match_id: matchId,
        p_player_id: playerId,
        p_token: getSessionToken() || '',
      });
      if (rpcErr) throw rpcErr;
      setRuleConsent(playerId, matchId);
      try { localStorage.setItem('ah2_last_registered_match', matchId); } catch { /* noop */ }

      if (match?.requires_approval) {
        setSuccess('✓ Solicitud enviada. Espera aprobación del admin.');
        setRegStatus('pending');
      } else {
        setSuccess('✓ ¡Registrado! Redirigiendo…');
        setRegStatus('confirmed');
        setTimeout(() => navigate('/partida?id=' + matchId), 1500);
      }
      void regStatus;
    } catch (e: any) {
      setError('✖ Error: ' + (e.message || 'desconocido'));
    } finally {
      setSubmitting(false);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (sanction?.isSanctioned) { setError('✖ ' + sanction.reason); return; }
    if (!match) { setError('✖ La información de la partida no está lista.'); return; }
    if (!playerId || !matchId) { setError('✖ Sesión o partida no encontrada.'); return; }
    if (hasRuleConsent(playerId, matchId)) doRegister();
    else { setConsentChecked(false); setConsentScrolled(false); setConsentOpen(true); }
  }

  if (loading || pageLoading) return <Loader />;

  const banned = sanction?.isSanctioned;

  return (
    <div style={{ maxWidth: 640, margin: '40px auto', padding: '0 16px' }}>
      <div style={{ ...styles.card, padding: 32 }}>
        {/* Banner de baneo */}
        {banned && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🚫</div>
            <h2 style={{ color: colors.danger, margin: 0 }}>Cuenta restringida</h2>
            <p style={{ color: colors.muted, marginTop: 8 }}>{sanction?.reason || 'Has recibido una sanción.'}</p>
            <p style={{ color: colors.warning, fontSize: 14 }}>Tiempo restante: {sanction?.remainingText}</p>
          </div>
        )}

        {/* Info del jugador */}
        {!banned && (regStatus === null || regStatus === 'rejected') && (
          <div style={{ marginBottom: 20, textAlign: 'center' }}>
            <p style={{ fontWeight: 700, fontSize: 18, margin: 0 }}>{displayName}</p>
            <p style={{ color: colors.muted, fontSize: 13, margin: '4px 0 0' }}>ID: {playerId}</p>
          </div>
        )}

        {/* Info de la partida */}
        {!banned && match && (regStatus === null || regStatus === 'rejected') && (
          <div style={{ background: colors.cardAlt, borderRadius: 10, padding: '12px 16px', marginBottom: 20, fontSize: 14 }}>
            <strong>{match.name}</strong>
            {match.alliance_name ? ` (${match.alliance_name})` : ''}
            <span style={{ color: colors.muted, marginLeft: 8, fontSize: 12 }}>
              {match.match_type} · {match.status}
            </span>
          </div>
        )}

        {error && <div style={{ color: colors.danger, marginBottom: 12 }}>{error}</div>}
        {success && <div style={{ color: colors.success, marginBottom: 12 }}>{success}</div>}

        {/* Ya registrado */}
        {!banned && (regStatus === 'confirmed' || regStatus === 'approved') && (
          <div style={{ textAlign: 'center' }}>
            <p style={{ color: colors.success, fontWeight: 700 }}>✓ Ya estás registrado en esta partida.</p>
            {showCredentials && match && (
              <div style={{ background: colors.cardAlt, borderRadius: 10, padding: 16, marginTop: 16, textAlign: 'left' }}>
                <h4 style={{ margin: '0 0 10px', color: colors.accent }}>Credenciales de la partida</h4>
                <p style={{ fontSize: 14, margin: '4px 0' }}><strong>ID de partida:</strong> <code style={{ color: colors.info }}>{match.game_id || '---'}</code></p>
                <p style={{ fontSize: 14, margin: '4px 0' }}><strong>Contraseña:</strong> <code style={{ color: colors.info }}>{match.password || '---'}</code></p>
              </div>
            )}
            {session && <div style={{ marginTop: 16 }}><PushToggle playerId={session.playerId} /></div>}
          </div>
        )}

        {/* Esperando aprobación */}
        {!banned && regStatus === 'pending' && (
          <div style={{ textAlign: 'center', color: colors.warning }}>
            <p style={{ fontWeight: 700 }}>⏳ Tu solicitud está pendiente de aprobación.</p>
          </div>
        )}

        {/* Rechazado */}
        {!banned && regStatus === 'rejected' && (
          <div style={{ textAlign: 'center' }}>
            <p style={{ color: colors.danger }}>✖ Tu solicitud fue rechazada.</p>
          </div>
        )}

        {/* Formulario de registro */}
        {!banned && regStatus === null && match && (
          <>
            {match.status !== 'open' ? (
              <p style={{ color: colors.danger, textAlign: 'center' }}>✖ Esta partida no está abierta para registro.</p>
            ) : (
              <form onSubmit={onSubmit} style={{ textAlign: 'center' }}>
                <Button type="submit" disabled={submitting}>{submitting ? 'Registrando…' : 'Registrarme en la partida'}</Button>
              </form>
            )}
          </>
        )}

        {!banned && !match && !error && <Loader />}
      </div>

      {/* Modal consentimiento */}
      {consentOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setConsentOpen(false)}>
          <div style={{ ...styles.card, maxWidth: 560, width: '100%', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ color: colors.text, marginTop: 0 }}>📜 Reglamento de la partida</h3>
            <div
              onScroll={(e) => {
                const el = e.currentTarget;
                if (el.scrollTop + el.clientHeight >= el.scrollHeight - 20) setConsentScrolled(true);
              }}
              style={{ overflowY: 'auto', flex: 1, minHeight: 200, color: colors.muted, fontSize: 14, lineHeight: 1.6, paddingRight: 6 }}
            >
              <p>Al participar en las partidas de AllianceHub aceptas el reglamento completo disponible en la sección Reglas.</p>
              <p>Las infracciones son sancionadas con strikes, penalizaciones de kills efectivas o suspensiones según su gravedad.</p>
              <p>El uso de multicuentas, exploits o conducta tóxica está prohibido y puede resultar en ban permanente.</p>
              <p>Los resultados se calculan con las bajas efectivas: los strikes aplican penalizaciones según su fórmula.</p>
              <p style={{ marginBottom: 0 }}>Desliza hasta el final y marca la casilla para confirmar que leíste y aceptas el reglamento.</p>
            </div>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '12px 0', color: colors.text, fontSize: 14 }}>
              <input type="checkbox" checked={consentChecked} onChange={(e) => setConsentChecked(e.target.checked)} />
              He leído y acepto el reglamento
            </label>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <Button variant="ghost" onClick={() => setConsentOpen(false)}>Cancelar</Button>
              <Button
                disabled={!consentChecked || !consentScrolled}
                onClick={() => {
                  setConsentOpen(false);
                  setRuleConsent(playerId!, matchId!);
                  if (regStatus === 'confirmed' || regStatus === 'approved') setShowCredentials(true);
                  else doRegister();
                }}
              >
                Aceptar y continuar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
