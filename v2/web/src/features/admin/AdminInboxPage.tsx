import { useEffect, useState } from 'react';
import { publicDb } from '../../lib/api';
import { colors } from '../../theme';
import { formatDateTime } from '../../lib/format';
import AdminGate from '../../components/AdminGate';
import Badge from '../../components/Badge';
import Loader from '../../components/Loader';
import EmptyState from '../../components/EmptyState';

interface Message {
  id: string;
  subject: string | null;
  sender_name: string | null;
  message: string;
  read_at: string | null;
  created_at: string;
}

const cardStyle: React.CSSProperties = { background: colors.cardAlt, border: `1px solid ${colors.border}`, borderRadius: 12, padding: 16 };

/** AdminInboxPage — puerto de admin-inbox.js. */
function Inbox() {
  const [messages, setMessages] = useState<Message[] | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data: sessData } = await publicDb.auth.getSession();
        const session = sessData.session;
        if (!session) { setMessages([]); return; }
        const { data, error } = await publicDb.from('direct_messages')
          .select('*')
          .eq('recipient_admin_id', session.user.id)
          .order('created_at', { ascending: false })
          .limit(50);
        if (error) throw error;
        setMessages((data as Message[]) || []);
      } catch (e) {
        console.error('[Inbox]', e);
        setMessages([]);
      }
    })();
  }, []);

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>
      <h1 style={{ fontSize: 28, margin: '0 0 4px' }}>Mensajes</h1>
      <p style={{ color: colors.muted, margin: '0 0 24px' }}>Mensajes directos recibidos como admin</p>

      {messages === null ? (
        <Loader />
      ) : messages.length === 0 ? (
        <EmptyState message="No hay mensajes" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {messages.map((m) => (
            <div key={m.id} style={cardStyle}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16 }}>{m.subject || 'Sin asunto'}</h3>
                  <p style={{ fontSize: 13, color: colors.muted, margin: '4px 0 0' }}>De: {m.sender_name || 'Admin'}</p>
                </div>
                {!m.read_at && <Badge label="NUEVO" tone="warning" />}
              </div>
              <p style={{ fontSize: 14, margin: '10px 0 6px' }}>{m.message}</p>
              <p style={{ fontSize: 12, color: colors.muted, margin: 0 }}>{formatDateTime(m.created_at)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminInboxPage() {
  return (
    <AdminGate staffOnly>
      <Inbox />
    </AdminGate>
  );
}
