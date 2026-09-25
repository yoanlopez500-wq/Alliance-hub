import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { publicDb } from '../../lib/api';
import AdminGate from '../../components/AdminGate';
import { loadAlliances, badge, type Alliance } from '../../lib/admin';
import { STATUS_LABELS } from '../../lib/format';
import { colors, styles } from '../../theme';
import Button from '../../components/Button';
import { Input, Select, TextArea } from '../../components/Field';
import Loader from '../../components/Loader';
import Reveal from '../../components/Reveal';

const TYPE_LABEL: Record<string, string> = { internal: 'Interna', duel: 'Duelo', tournament: 'Torneo' };

interface GameForm {
  id: string; name: string; description: string; match_type: string;
  max_players: number; alliance_id: string; game_id: string; password: string; is_public: boolean;
}

const EMPTY_FORM: GameForm = { id: '', name: '', description: '', match_type: 'internal', max_players: 10, alliance_id: '', game_id: '', password: '', is_public: false };

/** AdminGamesPage — puerto de admin-games.js (CRUD de games/partidas). */
function Games() {
  const [games, setGames] = useState<any[] | null>(null);
  const [alliances, setAlliances] = useState<Alliance[]>([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [modal, setModal] = useState<GameForm | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error: e } = await publicDb.from('matches').select('*').order('created_at', { ascending: false });
    if (e) { setError(e.message); setGames([]); return; }
    setGames((data as any[]) ?? []);
  }, []);

  useEffect(() => {
    load();
    loadAlliances().then(setAlliances);
  }, [load]);

  function openEdit(g: any) {
    setModal({
      id: g.id, name: g.name || '', description: g.description || '', match_type: g.match_type || 'internal',
      max_players: g.max_players || 10, alliance_id: g.alliance_id || '', game_id: g.game_id || '',
      password: g.password || '', is_public: g.is_private === false && g.match_type !== 'internal',
    });
  }

  async function save() {
    if (!modal) return;
    let isPrivate: boolean;
    if (modal.match_type === 'internal') {
      isPrivate = true;
      if (modal.is_public) window.alert("Las partidas internas no pueden ser publicas.");
    } else {
      isPrivate = !modal.is_public;
    }
    const payload: Record<string, unknown> = {
      name: modal.name, description: modal.description, match_type: modal.match_type,
      max_players: modal.max_players, alliance_id: modal.alliance_id || null,
      game_id: modal.game_id || null, password: modal.password || null, is_private: isPrivate,
    };
    try {
      if (modal.id) {
        const { error: e } = await publicDb.from('matches').update(payload).eq('id', modal.id);
        if (e) throw e;
      } else {
        const { error: e } = await publicDb.from('matches').insert({ ...payload, status: 'draft' });
        if (e) throw e;
      }
      setModal(null);
      load();
    } catch (e: any) { setError(e?.message ?? String(e)); }
  }

  async function remove(id: string) {
    if (!window.confirm('Eliminar esta partida?')) return;
    const { error: e } = await publicDb.from('matches').delete().eq('id', id);
    if (e) setError(e.message);
    load();
  }

  const filtered = statusFilter === 'all' ? (games ?? []) : (games ?? []).filter((g) => g.status === statusFilter);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
        <h1 style={{ color: colors.text, margin: 0 }}>🎮 Games</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          {['all', 'draft', 'open', 'in_progress', 'finished'].map((s) => (
            <button key={s} onClick={() => setStatusFilter(s)} style={{
              padding: '6px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700,
              background: statusFilter === s ? colors.accentGradient : colors.cardAlt,
              color: statusFilter === s ? '#fff' : colors.muted,
            }}>{s === 'all' ? 'Todas' : STATUS_LABELS[s]}</button>
          ))}
          <Button onClick={() => setModal({ ...EMPTY_FORM })}>+ Nuevo</Button>
        </div>
      </div>
      {error && <p style={{ color: colors.danger, fontSize: 13 }}>{error}</p>}
      {!games ? <Loader /> : filtered.length === 0 ? (
        <p style={{ color: colors.muted, textAlign: 'center', padding: '24px 0' }}>No hay partidas</p>
      ) : filtered.map((g) => (
        <div key={g.id} style={{ ...styles.card, marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {badge(g.status)}
              <span style={{ fontSize: 12, color: colors.muted }}>{TYPE_LABEL[g.match_type] || g.match_type}</span>
            </div>
            <h3 style={{ margin: '6px 0 2px', color: colors.text }}>{g.name}</h3>
            {g.description && <p style={{ margin: 0, fontSize: 12, color: colors.muted }}>{g.description}</p>}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Link to={`/admin/partida?id=${g.id}`} style={{ ...styles.btnGhost, padding: '6px 12px', fontSize: 12, textDecoration: 'none' }}>Ver</Link>
            <Button variant="ghost" onClick={() => openEdit(g)}>Editar</Button>
            <Button variant="danger" onClick={() => remove(g.id)}>Eliminar</Button>
          </div>
        </div>
      ))}

      {modal && (
        <div onClick={() => setModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ ...styles.card, width: 440, maxHeight: '85vh', overflowY: 'auto' }}>
            <h3 style={{ margin: '0 0 12px', color: colors.text }}>{modal.id ? 'Editar Game' : 'Nuevo Game'}</h3>
            <label style={{ fontSize: 12, color: colors.muted }}>Nombre</label>
            <Input value={modal.name} onChange={(e) => setModal({ ...modal, name: e.target.value })} style={styles.input} />
            <label style={{ fontSize: 12, color: colors.muted }}>Descripcion</label>
            <TextArea rows={2} value={modal.description} onChange={(e) => setModal({ ...modal, description: e.target.value })} style={styles.input} />
            <label style={{ fontSize: 12, color: colors.muted }}>Tipo</label>
            <Select value={modal.match_type} onChange={(e) => setModal({ ...modal, match_type: e.target.value })} style={styles.input}>
              <option value="internal">Interna</option>
              <option value="duel">Duelo</option>
              <option value="tournament">Torneo</option>
              <option value="global">Global</option>
            </Select>
            <label style={{ fontSize: 12, color: colors.muted }}>Max jugadores</label>
            <Input type="number" value={modal.max_players} onChange={(e) => setModal({ ...modal, max_players: parseInt(e.target.value) || 10 })} style={styles.input} />
            <label style={{ fontSize: 12, color: colors.muted }}>Alianza</label>
            <Select value={modal.alliance_id} onChange={(e) => setModal({ ...modal, alliance_id: e.target.value })} style={styles.input}>
              <option value="">Ninguna</option>
              {alliances.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
            <label style={{ fontSize: 12, color: colors.muted }}>ID de juego</label>
            <Input value={modal.game_id} onChange={(e) => setModal({ ...modal, game_id: e.target.value })} style={styles.input} />
            <label style={{ fontSize: 12, color: colors.muted }}>Password</label>
            <Input value={modal.password} onChange={(e) => setModal({ ...modal, password: e.target.value })} style={styles.input} />
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', color: colors.text, fontSize: 13, margin: '8px 0' }}>
              <input type="checkbox" checked={modal.is_public} onChange={(e) => setModal({ ...modal, is_public: e.target.checked })} />
              Partida publica (visible en dashboard)
            </label>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <Button variant="ghost" onClick={() => setModal(null)}>Cancelar</Button>
              <Button onClick={save}>Guardar</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminGamesPage() {
  return (
    <AdminGate staffOnly>
      <Reveal><Games /></Reveal>
    </AdminGate>
  );
}
