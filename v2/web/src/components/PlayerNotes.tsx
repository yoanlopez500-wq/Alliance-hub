import { useCallback, useEffect, useState } from 'react';
import { colors } from '../theme';
import { fetchPlayerNotes, createPlayerNote, noteScopeLabel, type PlayerNote } from '../lib/notes';

interface Props {
  playerId: number;
  /**
   * null  -> panel de solo lectura (cualquiera con permiso RLS puede ver lo suyo).
   * undefined no se usa; showComposer=false oculta el formulario.
   */
  showComposer: boolean;
  /** Alcance de las notas que se crean desde aqui. null = nota de staff. */
  createScope: string | null;
  authorName: string;
  authorRole: string;
  onChanged?: () => void;
}

/**
 * Panel de notas internas de un jugador. PRIVADO: la RLS de player_notes
 * decide que filas llegan (staff ve notas globales; lideres las de su
 * alianza; un usuario sin permiso recibe error y el panel se oculta — nada
 * de contenido privado se filtra al publico). Append-only: no hay edicion.
 */
export default function PlayerNotes({ playerId, showComposer, createScope, authorName, authorRole, onChanged }: Props) {
  const [notes, setNotes] = useState<PlayerNote[] | null>(null);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const rows = await fetchPlayerNotes(playerId);
      setNotes(rows);
      setAllowed(true);
    } catch {
      // Sin permiso (o error): el panel no se muestra, fallo cerrado.
      setAllowed(false);
    }
  }, [playerId]);

  useEffect(() => { load(); }, [load]);

  if (allowed === null) return null;
  if (allowed === false) return null;

  async function submit() {
    if (!body.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      await createPlayerNote({ playerId, allianceId: createScope, body, authorName, authorRole });
      setBody('');
      await load();
      onChanged?.();
    } catch (e: any) {
      setError('No se pudo guardar: ' + (e?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${colors.border}` }}>
      <h2 style={{ margin: '0 0 4px', fontSize: 16, color: colors.text }}>📝 Notas internas</h2>
      <p style={{ margin: '0 0 10px', fontSize: 11, color: colors.muted }}>
        Privadas (diferente a los reportes). Con registro de autor y fecha. Solo staff y lideres autorizados.
      </p>

      {notes && notes.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: showComposer ? 12 : 0 }}>
          {notes.map((n) => (
            <div key={n.id} style={{ background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 8, padding: '10px 12px' }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: colors.accent }}>{noteScopeLabel(n.alliance_id)}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: colors.text }}>{n.author_name}</span>
                <span style={{ fontSize: 10, color: colors.muted }}>{n.author_role}</span>
                <span style={{ fontSize: 10, color: colors.muted, marginLeft: 'auto' }}>
                  {new Date(n.created_at).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}
                </span>
              </div>
              <p style={{ margin: 0, fontSize: 13, color: colors.text, whiteSpace: 'pre-wrap' }}>{n.body}</p>
            </div>
          ))}
        </div>
      ) : (
        <p style={{ fontSize: 12, color: colors.muted, marginBottom: showComposer ? 12 : 0 }}>Sin notas todavia.</p>
      )}

      {showComposer && (
        <div>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            placeholder="Escribe una nota interna sobre este jugador..."
            style={{
              width: '100%', boxSizing: 'border-box', resize: 'vertical',
              background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 8,
              padding: '10px 12px', color: colors.text, fontSize: 13, fontFamily: 'inherit',
            }}
          />
          {error && <p style={{ fontSize: 12, color: colors.danger, margin: '6px 0' }}>{error}</p>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
            <button
              onClick={submit}
              disabled={busy || !body.trim()}
              style={{
                fontSize: 13, fontWeight: 700, padding: '8px 16px', borderRadius: 8, border: 'none',
                background: busy || !body.trim() ? colors.muted : colors.accent, color: '#fff', cursor: busy || !body.trim() ? 'default' : 'pointer',
              }}
            >
              {busy ? 'Guardando...' : 'Guardar nota'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
