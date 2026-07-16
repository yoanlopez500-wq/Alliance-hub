window.requireAdmin();

var currentChannel = 'general';
var subscription = null;

async function switchChannel(channel) {
    currentChannel = channel;
    document.getElementById('chat-header').textContent = '# ' + channel;

    document.querySelectorAll('#channel-list button').forEach(function(btn) {
        if (btn.dataset.channel === channel) {
            btn.style.background = 'rgba(255,143,0,0.15)';
            btn.style.color = '#ff8f00';
            btn.classList.add('font-medium');
        } else {
            btn.style.background = 'transparent';
            btn.style.color = '#9fa8da';
            btn.classList.remove('font-medium');
        }
    });

    if (subscription) { subscription.unsubscribe(); }

    await loadMessages();
    subscribeToChannel();
}

async function loadMessages() {
    var { data: messages, error } = await window.supabase.from('chat_messages').select('*').eq('channel', currentChannel).order('created_at', { ascending: true }).limit(100);
    var container = document.getElementById('chat-messages');
    if (error) { container.innerHTML = '<div class="text-center text-sm" style="color:#ef5350;">Error cargando mensajes</div>'; return; }
    if (!messages || messages.length === 0) { container.innerHTML = '<div class="text-center text-sm" style="color:#9fa8da;">Sin mensajes aun. Se el primero!</div>'; return; }
    container.innerHTML = messages.map(renderMessage).join('');
    container.scrollTop = container.scrollHeight;
}

function renderMessage(msg) {
    var isAdmin = msg.sender_role === 'admin' || msg.sender_admin_id;
    var badge = isAdmin ? '<span class="px-1.5 py-0.5 rounded text-[10px] font-bold ml-1" style="background:rgba(255,143,0,0.15);color:#ff8f00;">ADMIN</span>' : '';
    var time = new Date(msg.created_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    return '<div class="flex items-start gap-2">' +
        '<div class="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0" style="background:#1a237e;">' + (msg.sender_name ? msg.sender_name[0].toUpperCase() : '?') + '</div>' +
        '<div class="flex-1 min-w-0">' +
            '<div class="flex items-center gap-1">' +
                '<span class="font-bold text-sm">' + (msg.sender_name || 'Anonimo') + '</span>' + badge +
                '<span class="text-xs ml-auto" style="color:#9fa8da;">' + time + '</span>' +
            '</div>' +
            '<p class="text-sm break-words" style="color:#9fa8da;">' + escapeHtml(msg.message) + '</p>' +
        '</div></div>';
}

function escapeHtml(text) { var div = document.createElement('div'); div.textContent = text; return div.innerHTML; }

async function sendMessage() {
    var input = document.getElementById('chat-input');
    var text = input.value.trim();
    if (!text) return;

    var { data: { session } } = await window.supabase.auth.getSession();
    var adminName = 'Admin';
    if (session) {
        var { data: admin } = await window.supabase.from('admin_users').select('display_name').eq('id', session.user.id).single();
        if (admin) adminName = admin.display_name;
    }

    var { error } = await window.supabase.from('chat_messages').insert({ channel: currentChannel, sender_admin_id: session ? session.user.id : null, sender_name: adminName, sender_role: 'admin', message: text });
    if (error) { window.showToast('Error: ' + error.message, 'error'); return; }
    input.value = '';
}

function subscribeToChannel() {
    subscription = window.supabase.channel('chat-' + currentChannel)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: 'channel=eq.' + currentChannel }, function(payload) {
            var container = document.getElementById('chat-messages');
            var div = document.createElement('div');
            div.innerHTML = renderMessage(payload.new);
            container.appendChild(div.firstElementChild);
            container.scrollTop = container.scrollHeight;
        }).subscribe();
}

switchChannel('general');