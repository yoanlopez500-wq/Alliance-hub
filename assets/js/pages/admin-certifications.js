async function loadRequests() {
    var list = document.getElementById('requests-list');
    list.innerHTML = '<div class="text-center py-8" style="color: #9fa8da;">Cargando...</div>';
    try {
        var status = document.getElementById('filter-status').value;
        var q = window.supabase.from('alliance_leader_requests').select('*').order('created_at', { ascending: false });
        if (status !== 'all') q = q.eq('status', status);
        var { data, error } = await q;
        if (error) throw error;
        // Stats
        document.getElementById('stat-pending').textContent = '-';
        document.getElementById('stat-review').textContent = '-';
        document.getElementById('stat-approved').textContent = '-';
        document.getElementById('stat-rejected').textContent = '-';
        var { data: statsData } = await window.supabase.from('alliance_leader_requests').select('status');
        if (statsData) {
            var counts = { pending: 0, under_review: 0, approved: 0, rejected: 0 };
            statsData.forEach(function(s) { if (counts[s.status] !== undefined) counts[s.status]++; });
            document.getElementById('stat-pending').textContent = counts.pending;
            document.getElementById('stat-review').textContent = counts.under_review;
            document.getElementById('stat-approved').textContent = counts.approved;
            document.getElementById('stat-rejected').textContent = counts.rejected;
        }
        if (!data || data.length === 0) { list.innerHTML = '<div class="text-center py-8 rounded-xl" style="background: #11183a; border: 1px solid #1a237e; color: #9fa8da;">No hay solicitudes</div>'; return; }
        list.innerHTML = '<div class="space-y-3">' + data.map(function(r) {
            var statusClass = r.status === 'pending' ? 'status-pending' : r.status === 'under_review' ? 'status-review' : r.status === 'approved' ? 'status-approved' : 'status-rejected';
            var statusLabel = r.status === 'pending' ? 'PENDIENTE' : r.status === 'under_review' ? 'EN REVISION' : r.status === 'approved' ? 'APROBADO' : 'RECHAZADO';
            // FIX: Use correct DB column names - player_id and display_name
            return '<div class="rounded-xl p-5" style="background: #11183a; border: 1px solid #1a237e;"><div class="flex items-start justify-between gap-3"><div class="flex-1"><h3 class="font-bold text-lg text-white">' + r.alliance_name + ' <span style="color: #9fa8da;">[' + r.alliance_tag + ']</span></h3><p class="text-sm mt-1" style="color: #9fa8da;">Solicitante: <strong class="text-white">' + (r.display_name || 'N/A') + '</strong> (ID: ' + r.player_id + ')</p>' + (r.alliance_description ? '<p class="text-sm mt-2" style="color: #9fa8da;">' + r.alliance_description + '</p>' : '') + '<div class="flex gap-4 mt-2 text-xs" style="color: #9fa8da;"><span>&#128101; Miembros: ' + (r.member_count || '?') + '</span><span>&#128172; Discord: ' + (r.discord_handle || '-') + '</span><span>&#128197; ' + window.formatDate(r.created_at) + '</span></div></div><span class="px-3 py-1 rounded-full text-xs font-bold ' + statusClass + '">' + statusLabel + '</span></div>' + (r.rejection_reason ? '<p class="text-sm mt-2" style="color: #ef5350;">Motivo: ' + r.rejection_reason + '</p>' : '') + '</div>';
        }).join('') + '</div>';
    } catch(e) { console.error('[Certifications]', e); list.innerHTML = '<div class="text-center py-8 text-red-400">Error: ' + e.message + '</div>'; }
}
window.requireAdmin();
loadRequests();