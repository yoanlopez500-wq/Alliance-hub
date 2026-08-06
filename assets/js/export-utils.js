/**
 * export-utils.js - Exportador de informes (window.AHExport)
 *
 * Genera informes de partida en dos formatos, SIN dependencias externas:
 *  - 'text': texto formateado para WhatsApp (bloque monoespaciado).
 *  - 'html': documento de impresion (window.print -> "Guardar como PDF").
 *
 * Modulos de contenido (a elegir por el usuario):
 *  - includeStats:   tabla de resultados (jugador, bajas, muertes, KD, validez)
 *  - includeStrikes: strikes de la partida (a quien, tipo, razon y notas)
 *
 * API:
 *   AHExport.buildMatchReport({ match, results, players, regIds, strikes, options })
 *     options = { includeStats, includeStrikes, format: 'text'|'html' }
 *     results YA VIENE ORDENADO por la vista (se exporta lo que se ve).
 *   AHExport.copyToClipboard(text) -> Promise<bool>
 *   AHExport.printReport(htmlDoc)  -> abre ventana de impresion
 *
 * Script clasico (sin ES modules). No toca la base de datos.
 */
(function() {
    'use strict';

    // --- helpers -----------------------------------------------------------

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function padRight(s, n) {
        s = String(s == null ? '' : s);
        return s.length >= n ? s : s + new Array(n - s.length + 1).join(' ');
    }

    function padLeft(s, n) {
        s = String(s == null ? '' : s);
        return s.length >= n ? s : new Array(n - s.length + 1).join(' ') + s;
    }

    function fmtDate(iso) {
        if (!iso) return '-';
        try {
            var d = new Date(iso);
            return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
        } catch(e) { return String(iso); }
    }

    var STATUS_LABELS = {
        draft: 'Borrador', open: 'Abierta', in_progress: 'En curso',
        finished: 'Finalizada', cancelled: 'Cancelada', archived: 'Archivada'
    };
    var TYPE_LABELS = { duel: 'Duelo', internal: 'Interna', global: 'Global' };

    function matchLabel(m) {
        return (m && m.name) ? m.name : 'Partida';
    }
    function matchMetaLine(m) {
        if (!m) return '';
        var status = STATUS_LABELS[m.status] || m.status || '-';
        var type = TYPE_LABELS[m.match_type || m.type] || m.match_type || m.type || '-';
        return fmtDate(m.created_at) + ' | Tipo: ' + type + ' | Estado: ' + status;
    }

    // Nombre de jugador: mapa players por id, con fallback al ID.
    function playerName(players, pid) {
        var p = players && players[pid];
        return (p && p.current_username) ? p.current_username : ('Jugador ' + pid);
    }

    // --- seccion de estadisticas ------------------------------------------

    function statsRowsText(results, players, regIds) {
        var rows = [];
        (results || []).forEach(function(r, i) {
            var name = playerName(players, r.player_id);
            if (name.length > 18) name = name.slice(0, 17) + '~';
            var kd = (typeof r.kd_ratio === 'number') ? r.kd_ratio.toFixed(2) : String(r.kd_ratio || '0');
            var valid = (regIds && regIds[r.player_id]) ? 'OK' : '--';
            rows.push(
                padRight((i + 1) + '.', 4) +
                padRight(name, 19) +
                padLeft((r.kills || 0) + 'K', 6) + ' / ' +
                padLeft((r.deaths || 0) + 'D', 5) +
                '  KD ' + padLeft(kd, 5) + '  ' + valid
            );
        });
        return rows;
    }

    // --- seccion de strikes ------------------------------------------------
    // strikes: filas de player_strikes con relaciones players / strike_types
    // (select set 'withRelations' de db-schema). Tolerante a filas planas.

    function strikePlayerName(s, players) {
        if (s.players && s.players.current_username) return s.players.current_username;
        return playerName(players, s.player_id);
    }
    function strikeTypeName(s) {
        if (s.strike_types && s.strike_types.name) return s.strike_types.name;
        return 'Strike';
    }

    function strikesText(strikes, players) {
        var lines = [];
        (strikes || []).forEach(function(s) {
            var line = '- ' + strikePlayerName(s, players) + ' - ' + strikeTypeName(s);
            if (s.reason) line += ': "' + s.reason + '"';
            lines.push(line);
            if (s.notes) lines.push('  Notas: ' + s.notes);
            if (s.is_active === false) lines.push('  (inactivo' + (s.removal_reason ? ': ' + s.removal_reason : '') + ')');
        });
        return lines;
    }

    // --- builder TEXT (WhatsApp) ------------------------------------------

    function buildText(data) {
        var out = [];
        out.push('*PARTIDA: ' + matchLabel(data.match) + '*');
        var meta = matchMetaLine(data.match);
        if (meta) out.push(meta);
        out.push('');

        if (data.includeStats) {
            var rows = statsRowsText(data.results, data.players, data.regIds);
            out.push('*RESULTADOS (' + rows.length + ')*');
            if (rows.length === 0) {
                out.push('Sin resultados registrados');
            } else {
                // Bloque monoespaciado: WhatsApp lo renderiza como tabla
                out.push('```');
                out = out.concat(rows);
                out.push('```');
            }
            out.push('');
        }

        if (data.includeStrikes) {
            var sl = strikesText(data.strikes, data.players);
            out.push('*STRIKES (' + (data.strikes || []).length + ')*');
            out = out.concat(sl.length ? sl : ['Sin strikes en esta partida']);
            out.push('');
        }

        out.push('_Exportado desde Alliance Hub_');
        return out.join('\n');
    }

    // --- builder HTML (impresion -> PDF) -----------------------------------

    function buildHtml(data) {
        var h = [];
        h.push('<h1>' + esc(matchLabel(data.match)) + '</h1>');
        h.push('<p class="meta">' + esc(matchMetaLine(data.match)) + '</p>');

        if (data.includeStats) {
            var rows = data.results || [];
            h.push('<h2>Resultados (' + rows.length + ')</h2>');
            if (rows.length === 0) {
                h.push('<p class="empty">Sin resultados registrados</p>');
            } else {
                h.push('<table><thead><tr><th>#</th><th>Jugador</th><th>Bajas</th><th>Muertes</th><th>KD</th><th>Valido</th></tr></thead><tbody>');
                rows.forEach(function(r, i) {
                    var kd = (typeof r.kd_ratio === 'number') ? r.kd_ratio.toFixed(2) : esc(r.kd_ratio || '0');
                    var valid = (data.regIds && data.regIds[r.player_id]) ? 'Si' : 'No';
                    h.push('<tr><td>' + (i + 1) + '</td><td>' + esc(playerName(data.players, r.player_id)) + '</td><td class="num">' + (r.kills || 0) + '</td><td class="num">' + (r.deaths || 0) + '</td><td class="num">' + kd + '</td><td>' + valid + '</td></tr>');
                });
                h.push('</tbody></table>');
            }
        }

        if (data.includeStrikes) {
            var st = data.strikes || [];
            h.push('<h2>Strikes (' + st.length + ')</h2>');
            if (st.length === 0) {
                h.push('<p class="empty">Sin strikes en esta partida</p>');
            } else {
                h.push('<ul class="strikes">');
                st.forEach(function(s) {
                    var item = '<strong>' + esc(strikePlayerName(s, data.players)) + '</strong> - ' + esc(strikeTypeName(s));
                    if (s.reason) item += ': "' + esc(s.reason) + '"';
                    if (s.notes) item += '<br><span class="notes">Notas: ' + esc(s.notes) + '</span>';
                    if (s.is_active === false) item += '<br><span class="notes">(inactivo' + (s.removal_reason ? ': ' + esc(s.removal_reason) : '') + ')</span>';
                    h.push('<li>' + item + '</li>');
                });
                h.push('</ul>');
            }
        }

        h.push('<p class="footer">Exportado desde Alliance Hub</p>');

        return '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">' +
            '<title>' + esc(matchLabel(data.match)) + ' - Informe</title>' +
            '<style>' +
            'body{font-family:system-ui,sans-serif;color:#1a1a2e;max-width:700px;margin:24px auto;padding:0 16px;}' +
            'h1{font-size:20px;margin:0 0 4px;}h2{font-size:15px;margin:20px 0 8px;border-bottom:2px solid #e0e0e0;padding-bottom:4px;}' +
            '.meta{color:#666;font-size:12px;margin:0 0 8px;}' +
            'table{width:100%;border-collapse:collapse;font-size:13px;}' +
            'th,td{border:1px solid #ccc;padding:6px 8px;text-align:left;}' +
            'th{background:#f0f0f5;}.num{text-align:right;}' +
            '.strikes{font-size:13px;padding-left:18px;}.strikes li{margin-bottom:8px;}' +
            '.notes{color:#555;font-size:12px;}.empty{color:#888;font-size:13px;}' +
            '.footer{margin-top:24px;color:#999;font-size:11px;text-align:center;}' +
            '@media print{body{margin:0;}}' +
            '</style></head><body>' + h.join('\n') + '</body></html>';
    }

    // --- API publica ---------------------------------------------------------

    /**
     * Construye el informe. data = {
     *   match, results (ya ordenados), players (mapa id->player), regIds,
     *   strikes, options: { includeStats, includeStrikes, format }
     * }
     */
    function buildMatchReport(data) {
        data = data || {};
        var opts = data.options || {};
        var payload = {
            match: data.match || null,
            results: data.results || [],
            players: data.players || {},
            regIds: data.regIds || {},
            strikes: data.strikes || [],
            includeStats: !!opts.includeStats,
            includeStrikes: !!opts.includeStrikes
        };
        if (!payload.includeStats && !payload.includeStrikes) {
            payload.includeStats = true; // defensa: nunca un informe vacio
        }
        return opts.format === 'html' ? buildHtml(payload) : buildText(payload);
    }

    async function copyToClipboard(text) {
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(text);
                return true;
            }
        } catch(e) { /* fallback abajo */ }
        try {
            var ta = document.createElement('textarea');
            ta.value = text;
            ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
            document.body.appendChild(ta);
            ta.focus();
            ta.select();
            var ok = document.execCommand('copy');
            document.body.removeChild(ta);
            return !!ok;
        } catch(e2) {
            return false;
        }
    }

    function printReport(htmlDoc) {
        var w = window.open('', '_blank');
        if (!w) return false; // popup bloqueado
        w.document.write(htmlDoc);
        w.document.close();
        w.focus();
        // Pequena espera para que cargue el render antes de imprimir
        setTimeout(function() { w.print(); }, 250);
        return true;
    }

    window.AHExport = {
        buildMatchReport: buildMatchReport,
        copyToClipboard: copyToClipboard,
        printReport: printReport
    };
})();
