async function loadMessages() {
    try {
        var { data: { session } } = await window.supabase.auth.getSession();
        if (!session) return;
        var { data, error } = await window.supabase.from('direct_messages').select('*').eq('recipient_admin_id', session.user.id).order('created_at', { ascending: false }).limit(50);
        if (error) throw error;
        var list = document.getElementById('messages-list');
        if (!data || data.length === 0) { list.innerHTML = '<div class="text-center py-8 rounded-xl" style="background:#11183a;border:1px solid #1a237e;color:#9fa8da;">No hay mensajes</div>'; return; }
        list.innerHTML = '<div class="space-y-3">' + data.map(function(m) { var isUnread = !m.read_at ? '<span class="px-2 py-0.5 rounded text-xs font-bold ml-2" style="background:rgba(255,143,0,0.15);color:#ff8f00;">NUEVO</span>' : ''; return '<div class="rounded-xl p-4" style="background:#11183a;border:1px solid #1a237e;"><div class="flex items-center justify-between"><div><h3 class="font-bold">' + (m.subject || 'Sin asunto') + '</h3><p class="text-sm" style="color:#9fa8da;">De: ' + (m.sender_name || 'Admin') + '</p></div>' + isUnread + '</div><p class="text-sm mt-2">' + m.message + '</p><p class="text-xs mt-2" style="color:#9fa8da;">' + window.formatDateTime(m.created_at) + '</p></div>'; }).join('') + '</div>';
    } catch(e) { console.error('[Inbox]', e); }
}
window.requireAdmin();
loadMessages();