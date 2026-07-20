/**
 * admin-import.js - Importador legacy de resultados CSV (admin/import.html)
 *
 * Formato esperado: player_id,kills,deaths[,match_id]
 * Solo inserta/actualiza match_results. Los totales de jugador (total_kills,
 * total_deaths, games_played) se recalculan en el frontend desde match_results
 * filtrados por match_registrations; no se actualizan directamente aqui.
 */
function handleDrop(e) { e.preventDefault(); var file = e.dataTransfer.files[0]; if (file) handleFile(file); }
function handleFile(file) { if (!file || !file.name.endsWith('.csv')) { window.showToast('Solo archivos CSV', 'error'); return; } var reader = new FileReader(); reader.onload = function(e) { parseAndPreview(e.target.result); }; reader.readAsText(file); }
function parseAndPreview(csvText) { var lines = csvText.split('\n').filter(function(l) { return l.trim(); }); var preview = document.getElementById('csv-preview'); preview.classList.remove('hidden'); var html = '<table class="w-full text-sm"><thead><tr style="background:#11183a;"><th class="p-2">Player ID</th><th class="p-2">Kills</th><th class="p-2">Deaths</th><th class="p-2">Match ID</th></tr></thead><tbody>'; var results = []; for (var i = 1; i < Math.min(lines.length, 21); i++) { var cols = lines[i].split(','); if (cols.length >= 3) { var pid = parseInt(cols[0].trim()); var kills = parseInt(cols[1].trim()) || 0; var deaths = parseInt(cols[2].trim()) || 0; var mid = cols[3] ? cols[3].trim() : null; if (pid) { results.push({ player_id: pid, kills: kills, deaths: deaths, match_id: mid }); html += '<tr style="border-bottom:1px solid #1a237e;"><td class="p-2">' + pid + '</td><td class="p-2">' + kills + '</td><td class="p-2">' + deaths + '</td><td class="p-2">' + (mid || '-') + '</td></tr>'; } } } if (lines.length > 21) html += '<tr><td colspan="4" class="p-2 text-center" style="color:#9fa8da;">... y ' + (lines.length - 21) + ' filas mas</td></tr>'; html += '</tbody></table>'; if (results.length > 0) { html += '<button onclick="importAll(' + JSON.stringify(results).replace(/"/g, '&quot;') + ')" class="mt-3 px-4 py-2 rounded-lg text-sm font-bold" style="background:linear-gradient(135deg,#ff6f00,#ff8f00);color:#fff;">Importar ' + results.length + ' resultados</button>'; } preview.innerHTML = html; }

async function importAll(results) {
    try {
        for (var i = 0; i < results.length; i++) {
            var r = results[i];
            var matchId = r.match_id || currentMatchId;
            if (!matchId) continue;
            await window.supabase.from('match_results').upsert({ match_id: matchId, player_id: r.player_id, kills: r.kills, deaths: r.deaths }, { onConflict: 'match_id,player_id' });
        }
        window.showToast(results.length + ' resultados importados', 'success');
        document.getElementById('csv-preview').classList.add('hidden');
    } catch(e) { window.showToast('Error: ' + e.message, 'error'); }
}

window.requireAdmin();
