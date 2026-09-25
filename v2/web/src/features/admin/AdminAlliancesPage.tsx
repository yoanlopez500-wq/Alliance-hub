import { useCallback, useEffect, useState } from 'react';
import { publicDb } from '../../lib/api';
import { colors } from '../../theme';
import AdminGate from '../../components/AdminGate';
import Button from '../../components/Button';
import { Input, TextArea } from '../../components/Field';
import Loader from '../../components/Loader';
import EmptyState from '../../components/EmptyState';

interface Alliance {
  id: string;
  name: string;
  tag: string;
  description: string | null;
}

const cardStyle: React.CSSProperties = { background: colors.cardAlt, border: `1px solid ${colors.border}`, borderRadius: 12, padding: 16 };
const labelStyle: React.CSSProperties = { display: 'block', fontSize: 13, color: colors.muted, marginBottom: 4 };

/** AdminAlliancesPage — puerto de admin-alliances.js. */
function Alliances() {
  const [alliances, setAlliances] = useState<Alliance[] | null>(null);
  const [memberCounts, setMemberCounts] = useState<Record<string, number>>({});
  const [error, setError] = useState('');
  const [modal, setModal] = useState<Alliance | 'new' | null>(null);
  const [fName, setFName] = useState('');
  const [fTag, setFTag] = useState('');
  const [fDesc, setFDesc] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const { data, error: aErr } = await publicDb.from('alliances').select('id, name, tag, description').order('name');
      if (aErr) throw aErr;
      setAlliances((data as Alliance[]) || []);

      const counts: Record<string, number> = {};
      try {
        const { data: memberships } = await publicDb.from('alliance_memberships').select('alliance_id').eq('status', 'approved');
        ((memberships as { alliance_id: string }[]) || []).forEach((m) => {
          counts[m.alliance_id] = (counts[m.alliance_id] || 0) + 1;
        });
      } catch (mcErr) { console.warn('[Alliances] Error contando miembros:', mcErr); }
      setMemberCounts(counts);
    } catch (e: any) {
      setError(e.message || 'Error');
      setAlliances([]);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openModal(a: Alliance | 'new') {
    setModal(a);
    setFName(a === 'new' ? '' : a.name);
    setFTag(a === 'new' ? '' : a.tag);
    setFDesc(a === 'new' ? '' : a.description || '');
  }

  async function save() {
    const name = fName.trim();
    const tag = fTag.trim();
    const desc = fDesc.trim();
    if (!name || !tag) { setError('Nombre y tag son requeridos'); return; }
    if (tag.length < 2 || tag.length > 10) { setError('Tag debe tener 2-10 caracteres'); return; }
    setSaving(true);
    try {
      const data = { name, tag, description: desc || null };
      const result = modal === 'new'
        ? await publicDb.from('alliances').insert([data])
        : await publicDb.from('alliances').update(data).eq('id', (modal as Alliance).id);
      if (result.error) throw result.error;
      setModal(null);
      await load();
    } catch (e: any) {
      setError(e.message || 'Error guardando');
    } finally {
      setSaving(false);
    }
  }

  async function del(id: string) {
    if (!window.confirm('¿Eliminar esta alianza?')) return;
    const { error } = await publicDb.from('alliances').delete().eq('id', id);
    if (error) { setError(error.message); return; }
    await load();
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 28, margin: '0 0 4px' }}>Alianzas</h1>
          <p style={{ color: colors.muted, margin: 0 }}>Gestión de alianzas registradas</p>
        </div>
        <Button onClick={() => openModal('new')}>+ Nueva alianza</Button>
      </div>

      {error && <div style={{ color: colors.danger, margin: '12px 0' }}>{error}</div>}

      {alliances === null ? (
        <Loader />
      ) : alliances.length === 0 ? (
        <EmptyState message="No hay alianzas registradas" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 20 }}>
          {alliances.map((a) => (
            <div key={a.id} style={cardStyle}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16 }}>{a.name} <span style={{ color: colors.muted }}>[{a.tag || '-'}]</span></h3>
                  <p style={{ fontSize: 12, color: colors.muted, margin: '4px 0 0' }}>{a.description || 'Sin descripción'}</p>
                  <p style={{ fontSize: 12, color: colors.muted, margin: '4px 0 0' }}>{memberCounts[a.id] || 0} miembros</p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button variant="ghost" style={{ fontSize: 12 }} onClick={() => openModal(a)}>Editar</Button>
                  <Button variant="danger" style={{ fontSize: 12 }} onClick={() => del(a.id)}>Eliminar</Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <div style={{ background: colors.card, border: `1px solid ${colors.border}`, borderRadius: 16, padding: 24, maxWidth: 440, width: '100%' }}>
            <h3 style={{ marginTop: 0 }}>{modal === 'new' ? 'Nueva Alianza' : 'Editar Alianza'}</h3>
            <label style={labelStyle}>Nombre *</label>
            <Input value={fName} onChange={(e) => setFName(e.target.value)} style={{ width: '100%', marginBottom: 12 }} />
            <label style={labelStyle}>Tag * (2-10 caracteres)</label>
            <Input value={fTag} onChange={(e) => setFTag(e.target.value)} style={{ width: '100%', marginBottom: 12 }} />
            <label style={labelStyle}>Descripción</label>
            <TextArea value={fDesc} onChange={(e) => setFDesc(e.target.value)} rows={3} style={{ width: '100%' }} />
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <Button onClick={save} disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</Button>
              <Button variant="ghost" onClick={() => setModal(null)}>Cancelar</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminAlliancesPage() {
  return (
    <AdminGate staffOnly>
      <Alliances />
    </AdminGate>
  );
}
