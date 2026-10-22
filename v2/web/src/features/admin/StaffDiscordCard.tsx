import { useEffect, useState } from 'react';
import { publicDb } from '../../lib/api';
import { colors, styles } from '../../theme';
import Button from '../../components/Button';

/**
 * Tarjeta "Avisos por DM de Discord": cada miembro del staff vincula su
 * Discord user ID para recibir DMs del bot cuando hay solicitudes de partida
 * pendientes y cuando alguien las resuelve (auditoria). Boton de prueba
 * verifica al instante que el DM llega (mismo servidor que el bot + DMs abiertos).
 */
export default function StaffDiscordCard({ adminId }: { adminId: string }) {
  const [discordId, setDiscordId] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await publicDb.from('staff_discord_links')
        .select('discord_user_id, enabled').eq('admin_user_id', adminId).maybeSingle();
      if (data) {
        setDiscordId((data as { discord_user_id: string }).discord_user_id);
        setEnabled((data as { enabled: boolean }).enabled);
      }
      setLoaded(true);
    })().catch(() => setLoaded(true));
  }, [adminId]);

  async function save() {
    setMessage(null);
    const trimmed = discordId.trim();
    if (!/^[0-9]{5,25}$/.test(trimmed)) {
      setMessage({ ok: false, text: '✖ ID de Discord no válido (solo números). En Discord: Ajustes → Avanzado → modo desarrollador, clic derecho a tu usuario → Copiar ID.' });
      return;
    }
    setSaving(true);
    try {
      const { error } = await publicDb.from('staff_discord_links').upsert({
        admin_user_id: adminId, discord_user_id: trimmed, enabled, updated_at: new Date().toISOString(),
      });
      if (error) throw error;
      setMessage({ ok: true, text: '✓ Guardado. Usa "Enviar prueba" para verificar que te llega el DM.' });
    } catch (e: any) {
      setMessage({ ok: false, text: '✖ ' + (e.message || 'Error al guardar') });
    } finally {
      setSaving(false);
    }
  }

  async function test() {
    setMessage(null);
    setTesting(true);
    try {
      const { error } = await publicDb.rpc('staff_discord_test');
      if (error) throw error;
      setMessage({ ok: true, text: '📨 Prueba enviada. Revisa tus DMs de Discord (tarda unos segundos).' });
    } catch (e: any) {
      setMessage({ ok: false, text: '✖ ' + (e.message || 'Error al enviar la prueba') });
    } finally {
      setTesting(false);
    }
  }

  if (!loaded) return null;

  return (
    <div style={{ ...styles.card, marginBottom: 20 }}>
      <h2 style={{ color: colors.text, margin: '0 0 4px', fontSize: 18 }}>🔔 Avisos por DM de Discord</h2>
      <p style={{ color: colors.muted, fontSize: 13, margin: '0 0 12px' }}>
        Recibe un mensaje privado del bot cada vez que un jugador propone una partida y cuando alguien del
        staff la aprueba o rechaza (con el listado de lo que queda pendiente). Debes compartir servidor con el bot y tener los DMs abiertos.
      </p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={discordId} onChange={(e) => setDiscordId(e.target.value)} placeholder="Tu ID de Discord (números)"
          style={{ ...styles.input, width: 240, marginBottom: 0 }} />
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', color: colors.muted, fontSize: 13 }}>
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> Avisos activos
        </label>
        <Button onClick={save} disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</Button>
        <Button variant="ghost" onClick={test} disabled={testing || !discordId.trim()}>
          {testing ? 'Enviando…' : '📨 Enviar prueba'}
        </Button>
      </div>
      {message && <p style={{ color: message.ok ? colors.success : colors.danger, margin: '10px 0 0', fontSize: 13 }}>{message.text}</p>}
    </div>
  );
}
