// assets/js/messaging.js v1 - Mensajes directos entre admins
// Depende de: base.js

async function countUnreadDirectMessages() {
    try {
        var sd = await supabase.auth.getSession();
        if (!sd.data.session) return 0;
        var { count, error } = await supabase.from('direct_messages')
            .select('*', { count: 'exact', head: true })
            .eq('recipient_admin_id', sd.data.session.user.id)
            .is('read_at', null);
        if (error) throw error;
        return count || 0;
    } catch(e) {
        console.error('[DM] countUnread error:', e);
        return 0;
    }
}

async function fetchRecentDirectMessages(limit) {
    try {
        var sd = await supabase.auth.getSession();
        if (!sd.data.session) return [];
        var { data, error } = await supabase.from('direct_messages')
            .select('*')
            .eq('recipient_admin_id', sd.data.session.user.id)
            .order('created_at', { ascending: false })
            .limit(limit || 10);
        if (error) throw error;
        return data || [];
    } catch(e) {
        console.error('[DM] fetchRecent error:', e);
        return [];
    }
}

async function markDirectMessageAsRead(messageId) {
    try {
        await supabase.from('direct_messages')
            .update({ read_at: new Date().toISOString() })
            .eq('id', messageId);
    } catch(e) {
        console.error('[DM] markRead error:', e);
    }
}

async function sendDirectMessage(recipientId, subject, message) {
    try {
        var sd = await supabase.auth.getSession();
        if (!sd.data.session) return { success: false, message: 'No hay sesion' };
        var { data: sender } = await supabase.from('admin_users')
            .select('display_name')
            .eq('id', sd.data.session.user.id)
            .single();
        var { error } = await supabase.from('direct_messages').insert({
            sender_admin_id: sd.data.session.user.id,
            recipient_admin_id: recipientId,
            sender_name: sender ? sender.display_name : 'Admin',
            subject: subject || null,
            message: message
        });
        if (error) return { success: false, message: error.message };
        return { success: true };
    } catch(e) {
        return { success: false, message: e.message };
    }
}

async function getAdminRecipients() {
    try {
        var sd = await supabase.auth.getSession();
        if (!sd.data.session) return [];
        var { data } = await supabase.from('admin_users')
            .select('id, display_name, role')
            .eq('status', 'active')
            .neq('id', sd.data.session.user.id)
            .order('display_name');
        return data || [];
    } catch(e) {
        return [];
    }
}

window.countUnreadDirectMessages = countUnreadDirectMessages;
window.fetchRecentDirectMessages = fetchRecentDirectMessages;
window.markDirectMessageAsRead = markDirectMessageAsRead;
window.sendDirectMessage = sendDirectMessage;
window.getAdminRecipients = getAdminRecipients;
