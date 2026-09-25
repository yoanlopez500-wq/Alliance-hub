import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { publicDb } from '../../lib/api';
import { usePlayerSession, getStoredPlayerName } from '../../lib/playerSession';
import { formatDateTime } from '../../lib/format';
import { colors, styles } from '../../theme';
import Button from '../../components/Button';
import { Input, TextArea } from '../../components/Field';
import Section from '../../components/Section';
import Loader from '../../components/Loader';
import Reveal from '../../components/Reveal';

const STATUS_META: Record<string, { label: string; color: string }> = {
  pending: { label: 'PENDIENTE', color: colors.warning },
  under_review: { label: 'EN REVISION', color: colors.info },
  approved: { label: 'APROBADO', color: colors.success },
  rejected: { label: 'RECHAZADO', color: colors.danger },
};

interface LeaderRequest {
  id: number;
  status: string;
  created_at: string;
  alliance_name: string;
  alliance_tag: string;
  rejection_reason: string | null;
  player_id: number;
  display_name: string;
}

/** ApplyLeaderPage — puerto de apply-leader.js: solicitud de liderazgo de alianza. */
export default function ApplyLeaderPage() {
  const { session, loading } = usePlayerSession();
  const playerId = session?.playerId ?? null;
  const [request, setRequest] = useState<LeaderRequest | null | undefined>(undefined);
  const [invite, setInvite] = useState<{ code: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState(false);

  const loadExisting = useCallback(async (pid: number) => {
    try {
      const { data } = await publicDb.from('alliance_leader_requests').select('*')
        .eq('player_id', pid).in('status', ['pending', 'under_review', 'approved'])
        .order('created_at', { ascending: false }).limit(1);
      const req = data && data.length > 0 ? (data[0] as LeaderRequest) : null;
      setRequest(req);
      if (req?.status === 'approved') {
        try {
          const { data: inv } = await publicDb.rpc('get_player_invite', { p_player_id: pid });
          setInvite(inv && inv.length > 0 ? inv[0] : null);
        } catch (e) { console.error('[ApplyLeader] invite:', e); }
      }
    } catch (e) {
      console.error('[ApplyLeader] solicitud existente:', e);
      setRequest(null);
    }
  }, []);

  useEffect(() => {
    if (playerId) loadExisting(playerId);
    else if (!loading) setRequest(null);
  }, [playerId, loading, loadExisting]);

  if (loading) return <Loader />;

  if (!playerId) {
    return (
      <div style={{ maxWidth: 520, margin: '60px auto', padding: 16, textAlign: 'center' }}>
        <p style={{ color: colors.muted, marginBottom: 16 }}>Debes iniciar sesion como jugador para solicitar el liderazgo de una alianza.</p>
        <Link to="/login" style={{ color: colors.accent }}>Ir al login de jugador</Link>
      </div>
    );
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!playerId) return;
    setError(null);
    setSuccess(null);
    setSending(true);
    try {
      const fd = new FormData(e.currentTarget);
      const supremacyId = parseInt(String(fd.get('supremacy_id')), 10);
      const name = String(fd.get('alliance_name') || '').trim();
      const tag = String(fd.get('alliance_tag') || '').trim().toUpperCase();
      const desc = String(fd.get('alliance_description') || '').trim();
      const username = String(fd.get('display_name') || '').trim();
      const discord = String(fd.get('discord_handle') || '').trim();
      const memberCount = parseInt(String(fd.get('member_count') || ''), 10) || null;

      if (!name || !tag || !supremacyId || !username) throw new Error('Completa todos los campos obligatorios');
      if (tag.length < 2 || tag.length > 10) throw new Error('El tag debe tener entre 2 y 10 caracteres');
      if (String(supremacyId) !== String(playerId)) throw new Error('El ID de Supremacy debe coincidir con tu sesion de jugador');

      const { data: existingPlayer } = await publicDb.from('players').select('id').eq('id', supremacyId).maybeSingle();
      if (!existingPlayer) {
        const { error: pe } = await publicDb.from('players').insert({
          id: supremacyId, current_username: username, status: 'active',
        });
        if (pe) throw new Error('Error creando jugador: ' + pe.message);
      }

      const { data: existingReq } = await publicDb.from('alliance_leader_requests')
        .select('id, status').eq('player_id', supremacyId).in('status', ['pending', 'under_review']).maybeSingle();
      if (existingReq) throw new Error('Ya tienes una solicitud pendiente. Espera la respuesta del equipo.');

      const { error: insErr } = await publicDb.from('alliance_leader_requests').insert({
        player_id: supremacyId,
        display_name: username,
        supremacy_player_id: supremacyId,
        alliance_name: name,
        alliance_tag: tag,
        alliance_description: desc || null,
        discord_handle: discord || null,
        member_count: memberCount,
        status: 'pending',
      });
      if (insErr) throw new Error(insErr.message);

      setSuccess('Solicitud enviada correctamente. Un superadmin la revisara pronto.');
      loadExisting(playerId);
    } catch (err: any) {
      setError('✖ ' + (err?.message ?? 'Error desconocido'));
    } finally {
      setSending(false);
    }
  }

  const sm = request ? STATUS_META[request.status] : null;

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '24px 16px' }}>
      <Reveal>
        <h1 style={{ color: colors.text }}>🏅 Liderazgo de Alianza</h1>
        <p style={{ color: colors.muted, fontSize: 13 }}>
          Solicita ser lider reconocido de tu alianza. Un superadmin revisara tu solicitud y te dara un codigo de invitacion para completar el registro.
        </p>
      </Reveal>

      {request === undefined ? <Loader /> : request ? (
        <Reveal>
          <div style={styles.card}>
            <h2 style={{ margin: '0 0 12px', color: colors.text }}>Estado de tu solicitud</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              {sm && <span style={{ fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 6, background: `${sm.color}22`, color: sm.color }}>{sm.label}</span>}
              <span style={{ fontSize: 12, color: colors.muted }}>{formatDateTime(request.created_at)}</span>
            </div>
            <p style={{ color: colors.muted, fontSize: 13, margin: '4px 0' }}>
              <strong style={{ color: colors.text }}>Alianza:</strong> {request.alliance_name || '-'} [{request.alliance_tag || '-'}]
            </p>
            <p style={{ color: colors.muted, fontSize: 13, margin: '4px 0' }}>
              <strong style={{ color: colors.text }}>Solicitante:</strong> {request.display_name || '-'} (ID: {request.player_id})
            </p>
            {request.status === 'pending' && (
              <p style={{ color: colors.muted, fontSize: 13, marginTop: 12 }}>Tu solicitud esta pendiente de revision por un superadmin. Te notificaremos cuando sea aprobada.</p>
            )}
            {request.status === 'under_review' && (
              <p style={{ color: colors.muted, fontSize: 13, marginTop: 12 }}>Tu solicitud esta siendo revisada. Pronto tendras una respuesta.</p>
            )}
            {request.status === 'approved' && (
              <div style={{ marginTop: 16, padding: 12, borderRadius: 10, background: 'rgba(129,199,132,0.1)', border: '1px solid rgba(129,199,132,0.3)' }}>
                <p style={{ color: colors.success, fontWeight: 700, fontSize: 14, margin: '0 0 8px' }}>🏆 ¡Tu solicitud fue aprobada!</p>
                {invite?.code ? (
                  <>
                    <p style={{ color: colors.muted, fontSize: 13 }}>Usa este codigo para completar tu registro como lider:</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '8px 0' }}>
                      <code style={{ fontFamily: 'monospace', fontSize: 15, background: colors.bg, padding: '4px 12px', borderRadius: 6, border: `1px solid ${colors.border}`, color: colors.accent }}>{invite.code}</code>
                      <button
                        onClick={() => { navigator.clipboard?.writeText(invite.code); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
                        style={{ ...styles.btnGhost, padding: '4px 10px', fontSize: 12 }}
                      >{copied ? '¡Copiado!' : 'Copiar'}</button>
                    </div>
                  </>
                ) : (
                  <p style={{ color: colors.muted, fontSize: 13 }}>Contacta a un admin para obtener tu codigo de invitacion.</p>
                )}
              </div>
            )}
            {request.status === 'rejected' && (
              <p style={{ color: colors.danger, fontSize: 13, marginTop: 12 }}>
                Tu solicitud fue rechazada.{request.rejection_reason ? ` Motivo: ${request.rejection_reason}` : ''}
              </p>
            )}
          </div>
        </Reveal>
      ) : (
        <Reveal>
          <Section title="Formulario de solicitud">
            <form onSubmit={onSubmit}>
              <label style={{ fontSize: 12, color: colors.muted }}>Tu ID de Supremacy *</label>
              <Input name="supremacy_id" type="number" defaultValue={playerId} readOnly style={{ ...styles.input, opacity: 0.7 }} />
              <label style={{ fontSize: 12, color: colors.muted }}>Tu nombre de jugador *</label>
              <Input name="display_name" required defaultValue={getStoredPlayerName() ?? ''} style={styles.input} />
              <label style={{ fontSize: 12, color: colors.muted }}>Nombre de la alianza *</label>
              <Input name="alliance_name" required placeholder="Ej: Los Conquistadores" style={styles.input} />
              <label style={{ fontSize: 12, color: colors.muted }}>Tag de la alianza * (2-10 caracteres)</label>
              <Input name="alliance_tag" required maxLength={10} placeholder="Ej: CONQ" style={styles.input} />
              <label style={{ fontSize: 12, color: colors.muted }}>Descripcion</label>
              <TextArea name="alliance_description" rows={3} placeholder="Cuentanos sobre tu alianza..." style={styles.input} />
              <label style={{ fontSize: 12, color: colors.muted }}>Discord (opcional)</label>
              <Input name="discord_handle" placeholder="usuario#0000 o @usuario" style={styles.input} />
              <label style={{ fontSize: 12, color: colors.muted }}>Numero de miembros (aprox)</label>
              <Input name="member_count" type="number" min={1} placeholder="Ej: 15" style={styles.input} />
              {error && <p style={{ color: colors.danger, fontSize: 13 }}>{error}</p>}
              {success && <p style={{ color: colors.success, fontSize: 13 }}>{success}</p>}
              <Button type="submit" disabled={sending}>{sending ? 'Enviando...' : 'Enviar Solicitud'}</Button>
            </form>
          </Section>
        </Reveal>
      )}
    </div>
  );
}
