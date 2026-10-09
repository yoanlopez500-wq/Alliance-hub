import { useCallback, useEffect, useRef, useState } from 'react';
import { publicDb } from '../../lib/api';
import { colors, styles } from '../../theme';
import Button from '../../components/Button';

interface Q {
  id: number; match_id: string; author_name: string; text: string;
  reply_text: string | null; replied_at: string | null; created_at: string;
}

function fmtTs(ts: string) {
  return new Date(ts).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/**
 * MatchQuestions — hilo de preguntas/respuestas de una partida.
 * - Cualquier visitante (anon) lee y puede preguntar mientras la partida este abierta.
 * - canModerate: los responsables/staff ven cajas de respuesta y borrado.
 * Tiempo real via postgres_changes sobre match_questions.
 */
export default function MatchQuestions({ matchId, matchOpen, canModerate }: {
  matchId: string;
  matchOpen: boolean;
  canModerate: boolean;
}) {
  const [qs, setQs] = useState<Q[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [replies, setReplies] = useState<Record<number, string>>({});
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    const { data } = await publicDb.from('match_questions')
      .select('id, match_id, author_name, text, reply_text, replied_at, created_at')
      .eq('match_id', matchId).order('created_at', { ascending: true }).limit(100);
    setQs(((data as Q[] | null) ?? []).filter((q) => q.match_id === matchId));
    setLoading(false);
  }, [matchId]);

  useEffect(() => {
    setLoading(true);
    load();
    const ch = publicDb.channel('mq_' + matchId)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'match_questions', filter: `match_id=eq.${matchId}` },
        () => { load(); })
      .subscribe();
    return () => { publicDb.removeChannel(ch); };
  }, [matchId, load]);

  async function ask() {
    setBusy(true);
    setErr(null);
    const { error } = await publicDb.rpc('match_question_ask', {
      p_match_id: matchId, p_name: name, p_text: text,
    });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setText('');
    setOkMsg('✓ Pregunta enviada. Un responsable te responderá aquí mismo.');
    setTimeout(() => setOkMsg(null), 3000);
    load();
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 150);
  }

  async function reply(q: Q) {
    const t = (replies[q.id] ?? '').trim();
    if (!t) return;
    setBusy(true);
    const { error } = await publicDb.rpc('match_question_reply', { p_question_id: q.id, p_reply: t });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setReplies((r) => ({ ...r, [q.id]: '' }));
    load();
  }

  async function remove(q: Q) {
    if (!window.confirm('¿Eliminar esta pregunta?')) return;
    const { error } = await publicDb.rpc('match_question_delete', { p_question_id: q.id });
    if (error) setErr(error.message);
    else load();
  }

  return (
    <div>
      {loading ? <p style={{ margin: 0, fontSize: 13, color: colors.muted }}>Cargando preguntas…</p> : null}
      {!loading && qs.length === 0 && (
        <p style={{ margin: '0 0 8px', fontSize: 13, color: colors.muted }}>Todavía no hay preguntas. ¡Sé el primero!</p>
      )}
      {qs.map((q) => (
        <div key={q.id} style={{ marginBottom: 10, padding: 10, borderRadius: 8, background: colors.bg, border: `1px solid ${colors.border}` }}>
          <p style={{ margin: 0, fontSize: 13, color: colors.text }}>
            <strong>{q.author_name || 'Anónimo'}</strong>
            <span style={{ color: colors.muted, fontWeight: 400 }}> · {fmtTs(q.created_at)}</span>
          </p>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: colors.text, whiteSpace: 'pre-wrap' }}>{q.text}</p>
          {q.reply_text && (
            <div style={{ marginTop: 8, padding: '8px 10px', borderRadius: 6, background: 'rgba(129,199,132,0.10)', borderLeft: `3px solid ${colors.success}` }}>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: colors.success }}>✓ Respuesta de la organización{q.replied_at ? ` · ${fmtTs(q.replied_at)}` : ''}</p>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: colors.text, whiteSpace: 'pre-wrap' }}>{q.reply_text}</p>
            </div>
          )}
          {canModerate && (
            <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <textarea
                value={replies[q.id] ?? ''}
                onChange={(e) => setReplies((r) => ({ ...r, [q.id]: e.target.value }))}
                placeholder={q.reply_text ? 'Editar respuesta…' : 'Responder…'}
                rows={2}
                style={{ ...styles.input, flex: 1, minWidth: 180, marginBottom: 0, fontSize: 12 }}
              />
              <Button disabled={busy || !(replies[q.id] ?? '').trim()} onClick={() => reply(q)} style={{ padding: '4px 10px', fontSize: 12, alignSelf: 'flex-end' }}>
                {q.reply_text ? 'Actualizar' : 'Responder'}
              </Button>
              <Button variant="ghost" disabled={busy} onClick={() => remove(q)} style={{ padding: '4px 10px', fontSize: 12, alignSelf: 'flex-end' }}>🗑</Button>
            </div>
          )}
        </div>
      ))}
      <div ref={bottomRef} />
      {err && <p style={{ margin: '6px 0', fontSize: 12, color: colors.danger }}>{err}</p>}
      {okMsg && <p style={{ margin: '6px 0', fontSize: 12, color: colors.success }}>{okMsg}</p>}
      {matchOpen ? (
        <div style={{ marginTop: 8, borderTop: `1px dashed ${colors.border}`, paddingTop: 10 }}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Tu nombre (opcional)"
            maxLength={40}
            style={{ ...styles.input, marginBottom: 6, fontSize: 13 }}
          />
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Escribe tu pregunta sobre la partida…"
            rows={3}
            maxLength={500}
            style={{ ...styles.input, marginBottom: 6, fontSize: 13 }}
          />
          <Button disabled={busy || !text.trim()} onClick={ask} style={{ padding: '6px 14px', fontSize: 13 }}>
            Enviar pregunta
          </Button>
        </div>
      ) : (
        <p style={{ margin: '8px 0 0', fontSize: 12, color: colors.muted }}>La partida ya no está abierta: el hilo es de solo lectura.</p>
      )}
    </div>
  );
}
