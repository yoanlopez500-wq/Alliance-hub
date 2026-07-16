// assets/js/csv-parser.js
function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        const nextChar = line[i + 1];

        if (char === '"') {
            if (inQuotes && nextChar === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current.trim());
    return result;
}

function parseSupremacyCSV(csvText) {
    const lines = csvText.trim().split('\n');
    if (lines.length < 2) throw new Error('CSV vacío o inválido');

    const headers = parseCSVLine(lines[0]);
    const results = [];
    const errors = [];

    const nationIdx = headers.findIndex(h => h.toLowerCase().includes('nation'));
    const usernameIdx = headers.findIndex(h => h.toLowerCase().includes('username'));
    const idIdx = headers.findIndex(h => h.trim().toLowerCase() === 'id');
    const totalIdx = headers.findIndex(h => h.toLowerCase().includes('total'));

    if (nationIdx === -1 || usernameIdx === -1 || idIdx === -1 || totalIdx === -1) {
        throw new Error(`Columnas requeridas no encontradas. Headers: ${headers.join(', ')}`);
    }

    for (let i = 1; i < lines.length; i++) {
        const row = parseCSVLine(lines[i]);
        if (row.length < 3) continue;

        const playerId = row[idIdx]?.trim();
        if (!playerId || !/^\d+$/.test(playerId)) continue; // Ignorar bots

        const nation = row[nationIdx]?.trim();
        const username = row[usernameIdx]?.trim();
        const totalCell = row[totalIdx]?.trim();

        if (!nation || !username || !totalCell) {
            errors.push({ line: i + 1, reason: 'Datos incompletos' });
            continue;
        }

        const totalMatch = totalCell.match(/^(\d+)\/(\d+)/);
        if (!totalMatch) {
            errors.push({ line: i + 1, reason: `Formato Total inválido: "${totalCell}"` });
            continue;
        }

        const kills = parseInt(totalMatch[1]);
        const deaths = parseInt(totalMatch[2]);
        const kdRatio = deaths === 0 ? kills : parseFloat((kills / deaths).toFixed(2));

        results.push({
            player_id: parseInt(playerId),
            username: username,
            nation: nation,
            kills: kills,
            deaths: deaths,
            kd_ratio: kdRatio,
            raw_csv: row
        });
    }

    return { players: results, totalRows: lines.length - 1, importedCount: results.length, errors: errors };
}

function generatePreviewHTML(parsedData) {
    if (parsedData.players.length === 0) {
        return '<p class="text-red-500">No se encontraron jugadores válidos</p>';
    }

    let html = `
        <div class="mb-4 text-sm text-slate-600">
            <span class="font-bold">${parsedData.importedCount}</span> jugadores importados 
            <span class="text-slate-400">(${parsedData.totalRows - parsedData.importedCount} bots ignorados)</span>
        </div>
        <div class="overflow-x-auto">
            <table class="w-full text-sm">
                <thead class="bg-slate-100"><tr>
                    <th class="text-left p-2">Nación</th>
                    <th class="text-left p-2">Username</th>
                    <th class="text-left p-2">ID</th>
                    <th class="text-right p-2">Bajas</th>
                    <th class="text-right p-2">Muertes</th>
                    <th class="text-right p-2">KD</th>
                </tr></thead>
                <tbody>
    `;

    parsedData.players.forEach(p => {
        html += `
            <tr class="border-b hover:bg-slate-50">
                <td class="p-2">${p.nation}</td>
                <td class="p-2 font-medium">${p.username}</td>
                <td class="p-2 text-slate-500">${p.player_id}</td>
                <td class="p-2 text-right text-green-600 font-bold">${p.kills.toLocaleString()}</td>
                <td class="p-2 text-right text-red-500">${p.deaths.toLocaleString()}</td>
                <td class="p-2 text-right font-bold ${p.kd_ratio >= 1 ? 'text-green-600' : 'text-orange-500'}">${p.kd_ratio}</td>
            </tr>
        `;
    });

    html += '</tbody></table></div>';

    if (parsedData.errors.length > 0) {
        html += `
            <div class="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded text-sm">
                <p class="font-bold text-yellow-700">⚠️ ${parsedData.errors.length} filas con error:</p>
                <ul class="mt-1 text-yellow-600">
                    ${parsedData.errors.slice(0, 5).map(e => `<li>Línea ${e.line}: ${e.reason}</li>`).join('')}
                    ${parsedData.errors.length > 5 ? `<li>... y ${parsedData.errors.length - 5} más</li>` : ''}
                </ul>
            </div>
        `;
    }

    return html;
}

window.parseSupremacyCSV = parseSupremacyCSV;
window.generatePreviewHTML = generatePreviewHTML;
