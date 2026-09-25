import { Navigate } from 'react-router-dom';

/** AdminChatPage — puerto de admin-chat.js (DEPRECADO: redirige al chat consolidado). */
export default function AdminChatPage() {
  return <Navigate to="/chat" replace />;
}
