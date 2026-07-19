/**
 * api-importer.js - Importador de estadisticas K/D desde API externa (Excel .xlsx)
 *
 * Expone el modulo global window.ApiKdImporter (script clasico, sin ES modules).
 *
 * Flujo:
 *   1) fetchKdExcel(gameId, {force}) descarga el .xlsx del endpoint
 *      https://nekokoneko.org/api/game/excels/kd/sup/{gameId}
 *      aplicando rate limit (1 peticion / 10s, persistente en localStorage)
 *      y cache local de resultados (TTL 1 hora).
 *   2) Auto-deteccion de columnas (id, username, kills, deaths, nation, total)
 *      localizando la fila de cabeceras entre las ~10 primeras filas.
 *      Si no se detecta, devuelve needsManualMapping=true y las cabeceras
 *      para que la UI ofrezca selectores manuales de respaldo.
 *   3) reparse(rawRows, mapping, headerRowIndex, gameId) reprocesa las filas
 *      crudas con el mapeo manual elegido por el usuario.
 *
 * SheetJS (XLSX) se carga de forma perezosa desde CDN solo cuando se usa;
 * no bloquea la carga de la pagina.
 *
 * Filtro de bots: filas con id = -1 (o cualquier id numerico negativo) se
 * ignoran y se cuentan en skippedBots. IDs no numericos van a errors.
 *
 * kd_ratio: replica exacta del importador CSV -> deaths>0 ? kills/deaths : kills
 * con 2 decimales.
 */
(function () {
    'use strict';

    // ===================== CONSTANTES =====================
    var XLSX_CDN = 'https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js';
    var API_BASE = (function(){
      // Si hay Supabase configurado, usar Edge Function como proxy
      if (typeof window !== 'undefined' && window.SUPABASE_URL) {
        return window.SUPABASE_URL.replace(/\/$/, '') + '/functions/v1/kd-excel-proxy?gameId=';
      }
      // Fallback directo (solo funciona sin CORS, ej. local server o si el dev arregla CORS)
      return 'https://nekokoneko.org/api/game/excels/kd/sup/';
    })();
    var RATE_LIMIT_SECONDS = 10;                // 1 peticion cada 10 segundos
    var RATE_LIMIT_KEY = 'ah_kd_api_last_fetch';
    var CACHE_PREFIX = 'ah_kd_api_cache_';
    var CACHE_TTL_MS = 60 * 60 * 1000;          // 1 hora
    var MAX_CACHE_ENTRIES = 50;                 // limite LRU para no llenar localStorage
    var HEADER_SCAN_ROWS = 10;                  // filas iniciales donde buscar cabeceras
    var TOTAL_REGEX = /^(\d+)\s*[/|]\s*(\d+)/;  // celda combinada "kills/deaths"

    // Conjuntos de cabeceras candidatas (comparacion case-insensitive,
    // con espacios normalizados)
    var HEADER_CANDIDATES = {
        id: ['id', 'player id', 'player_id', 'id jugador', 'userid', 'user id'],
        username: ['username', 'name', 'player', 'jugador', 'nick', 'nickname'],
        kills: ['kills', 'bajas', 'kill'],
        deaths: ['deaths', 'muertes', 'death'],
        nation: ['nation', 'country', 'pais', 'país'],
        total: ['total', 'k/d', 'kd']
    };

    // ===================== HELPERS INTERNOS =====================

    function mkError(code, message) {
        var e = new Error(message);
        e.code = code;
        return e;
    }

    function clone(obj) {
        return JSON.parse(JSON.stringify(obj));
    }

    // ---------- Carga perezosa de SheetJS ----------
    var xlsxPromise = null;
    function loadXLSX() {
        if (window.XLSX) return Promise.resolve(window.XLSX);
        if (xlsxPromise) return xlsxPromise;
        xlsxPromise = new Promise(function (resolve, reject) {
            var s = document.createElement('script');
            s.src = XLSX_CDN;
            s.async = true;
            s.onload = function () {
                if (window.XLSX) resolve(window.XLSX);
                else {
                    xlsxPromise = null;
                    reject(mkError('LIBRARY', 'La libreria XLSX no se inicializo correctamente.'));
                }
            };
            s.onerror = function () {
                xlsxPromise = null;
                reject(mkError('LIBRARY', 'No se pudo cargar la libreria XLSX desde el CDN. Revisa tu conexion.'));
            };
            document.head.appendChild(s);
        });
        return xlsxPromise;
    }

    // ---------- Rate limit (persistente en localStorage) ----------
    function getLastFetchTs() {
        try { return parseInt(localStorage.getItem(RATE_LIMIT_KEY), 10) || 0; }
        catch (e) { return 0; }
    }

    /**
     * Segundos que faltan para poder hacer otra peticion (0 = se puede).
     * La UI lo usa para la cuenta atras del boton.
     */
    function getRateLimitRemaining() {
        var elapsed = Date.now() - getLastFetchTs();
        var remaining = Math.ceil((RATE_LIMIT_SECONDS * 1000 - elapsed) / 1000);
        return remaining > 0 ? remaining : 0;
    }

    function markFetch() {
        try { localStorage.setItem(RATE_LIMIT_KEY, String(Date.now())); } catch (e) {}
    }

    // ---------- Cache de resultados (TTL 1h) ----------
    function readCache(gameId) {
        try {
            var raw = localStorage.getItem(CACHE_PREFIX + gameId);
            if (!raw) return null;
            var obj = JSON.parse(raw);
            if (!obj || !obj.ts) return null;
            if (Date.now() - obj.ts > CACHE_TTL_MS) {
                localStorage.removeItem(CACHE_PREFIX + gameId);
                return null;
            }
            return obj;
        } catch (e) { return null; }
    }

    function writeCache(gameId, entry) {
        try {
            localStorage.setItem(CACHE_PREFIX + gameId, JSON.stringify(entry));
            pruneCache();
        }
        catch (e) { console.warn('[ApiKdImporter] No se pudo guardar la cache:', e); }
    }

    /** Limpia entradas antiguas si se excede MAX_CACHE_ENTRIES (LRU simple). */
    function pruneCache() {
        try {
            var entries = [];
            for (var i = 0; i < localStorage.length; i++) {
                var key = localStorage.key(i);
                if (!key || key.indexOf(CACHE_PREFIX) !== 0) continue;
                var raw = localStorage.getItem(key);
                var obj = raw ? JSON.parse(raw) : null;
                if (!obj || !obj.ts) {
                    localStorage.removeItem(key);
                    continue;
                }
                if (Date.now() - obj.ts > CACHE_TTL_MS) {
                    localStorage.removeItem(key);
                    continue;
                }
                entries.push({ key: key, ts: obj.ts });
            }
            if (entries.length <= MAX_CACHE_ENTRIES) return;
            entries.sort(function (a, b) { return a.ts - b.ts; });
            var toRemove = entries.length - MAX_CACHE_ENTRIES;
            for (var j = 0; j < toRemove; j++) {
                localStorage.removeItem(entries[j].key);
            }
        } catch (e) { console.warn('[ApiKdImporter] No se pudo podar la cache:', e); }
    }

    /** Info de cache para la UI ("hace X min") o null si no hay o expiro. */
    function getCacheInfo(gameId) {
        var c = readCache(String(gameId).trim());
        if (!c) return null;
        return { ts: c.ts, ageMin: Math.max(0, Math.round((Date.now() - c.ts) / 60000)) };
    }

    function clearCache(gameId) {
        try { localStorage.removeItem(CACHE_PREFIX + String(gameId).trim()); } catch (e) {}
    }

    /** Elimina todas las caches de importaciones API. */
    function clearAllCache() {
        try {
            var keys = [];
            for (var i = 0; i < localStorage.length; i++) {
                var key = localStorage.key(i);
                if (key && key.indexOf(CACHE_PREFIX) === 0) keys.push(key);
            }
            keys.forEach(function (k) { localStorage.removeItem(k); });
        } catch (e) { console.warn('[ApiKdImporter] No se pudo limpiar toda la cache:', e); }
    }

    // ---------- Normalizacion y deteccion de columnas ----------
    function normHeader(h) {
        return String(h === null || h === undefined ? '' : h)
            .trim().toLowerCase().replace(/\s+/g, ' ');
    }

    function findColumn(headerRow, field) {
        var candidates = HEADER_CANDIDATES[field] || [];
        for (var i = 0; i < headerRow.length; i++) {
            var h = normHeader(headerRow[i]);
            if (!h) continue;
            if (candidates.indexOf(h) !== -1) return i;
        }
        return -1;
    }

    function orNull(idx) { return idx === -1 ? null : idx; }

    /**
     * Localiza la fila de cabeceras: entre las ~10 primeras filas, la que
     * contenga mas encabezados reconocibles (minimo 2 para ser valida).
     * Devuelve el indice de fila o -1 si no se detecta.
     */
    function detectHeaderRow(rows) {
        var fields = ['id', 'username', 'kills', 'deaths', 'nation', 'total'];
        var best = -1, bestScore = 0;
        var limit = Math.min(rows.length, HEADER_SCAN_ROWS);
        for (var r = 0; r < limit; r++) {
            var row = rows[r];
            if (!row || !row.length) continue;
            var score = 0;
            for (var f = 0; f < fields.length; f++) {
                if (findColumn(row, fields[f]) !== -1) score++;
            }
            if (score > bestScore) { bestScore = score; best = r; }
        }
        return bestScore >= 2 ? best : -1;
    }

    /**
     * Construye la lista de cabeceras para la UI. Si hay fila de cabeceras,
     * usa sus valores; si no, genera etiquetas sinteticas "Col N" segun la
     * fila mas ancha de las primeras.
     */
    function buildHeaders(rows, headerRowIndex) {
        if (headerRowIndex >= 0 && rows[headerRowIndex]) {
            return rows[headerRowIndex].map(function (h, idx) {
                var s = (h === null || h === undefined) ? '' : String(h).trim();
                return s || ('Col ' + (idx + 1));
            });
        }
        var maxLen = 0;
        for (var i = 0; i < Math.min(rows.length, 5); i++) {
            if (rows[i] && rows[i].length > maxLen) maxLen = rows[i].length;
        }
        var headers = [];
        for (var c = 0; c < maxLen; c++) headers.push('Col ' + (c + 1));
        return headers;
    }

    /** Entero tolerante: acepta numeros y textos tipo "1,234" / "1 234". */
    function parseIntSafe(v) {
        if (v === null || v === undefined) return null;
        if (typeof v === 'number') return isFinite(v) ? Math.round(v) : null;
        var s = String(v).trim();
        if (!s) return null;
        var cleaned = s.replace(/[^\d\-]/g, '');
        if (!/^-?\d+$/.test(cleaned)) return null;
        return parseInt(cleaned, 10);
    }

    /** KD exacto del importador CSV: deaths>0 ? kills/deaths : kills (2 decimales). */
    function calcKd(kills, deaths) {
        var kd = deaths > 0 ? (kills / deaths) : kills;
        return parseFloat(kd.toFixed(2));
    }

    /**
     * Parsea las filas crudas con un mapeo concreto de columnas.
     * mapping = { id, username, kills, deaths, nation, total } (indices o null).
     * Requiere id y (kills+deaths o total); el llamador debe validarlo.
     */
    function parseRows(rows, mapping, headerRowIndex) {
        var players = [], errors = [], skippedBots = 0;
        var start = (typeof headerRowIndex === 'number' && headerRowIndex >= 0) ? headerRowIndex + 1 : 0;
        for (var i = start; i < rows.length; i++) {
            var row = rows[i];
            if (!row || !row.length) continue;
            // Saltar filas completamente vacias
            var hasAny = false;
            for (var c = 0; c < row.length; c++) {
                if (row[c] !== null && row[c] !== undefined && String(row[c]).trim() !== '') { hasAny = true; break; }
            }
            if (!hasAny) continue;

            var rawId = (mapping.id !== null && mapping.id !== undefined) ? row[mapping.id] : null;
            var pid = parseIntSafe(rawId);
            if (pid === null) {
                errors.push({ row: i + 1, reason: 'ID no numerico: "' + (rawId === null || rawId === undefined ? '' : String(rawId)) + '"' });
                continue;
            }
            // Bots: id = -1 (o cualquier id numerico negativo) se ignora
            if (pid < 0) { skippedBots++; continue; }

            var kills = 0, deaths = 0;
            if (mapping.kills !== null && mapping.kills !== undefined &&
                mapping.deaths !== null && mapping.deaths !== undefined) {
                kills = parseIntSafe(row[mapping.kills]);
                deaths = parseIntSafe(row[mapping.deaths]);
                if (kills === null || deaths === null) {
                    errors.push({ row: i + 1, reason: 'Bajas/Muertes no numericas' });
                    continue;
                }
            } else if (mapping.total !== null && mapping.total !== undefined) {
                var cell = row[mapping.total];
                var m = String(cell === null || cell === undefined ? '' : cell).trim().match(TOTAL_REGEX);
                if (!m) {
                    errors.push({ row: i + 1, reason: 'Formato Total invalido: "' + (cell === null || cell === undefined ? '' : String(cell)) + '"' });
                    continue;
                }
                kills = parseInt(m[1], 10);
                deaths = parseInt(m[2], 10);
            } else {
                errors.push({ row: i + 1, reason: 'Sin columna de bajas/muertes mapeada' });
                continue;
            }

            var username = (mapping.username !== null && mapping.username !== undefined &&
                row[mapping.username] !== null && row[mapping.username] !== undefined)
                ? String(row[mapping.username]).trim() : '';
            var nation = (mapping.nation !== null && mapping.nation !== undefined &&
                row[mapping.nation] !== null && row[mapping.nation] !== undefined)
                ? String(row[mapping.nation]).trim() : '';

            players.push({
                player_id: pid,
                username: username,
                nation: nation || null,
                kills: kills,
                deaths: deaths,
                kd_ratio: calcKd(kills, deaths)
            });
        }
        return { players: players, skippedBots: skippedBots, errors: errors };
    }

    // ---------- Auto-deteccion completa ----------
    function autoParse(rows) {
        var hIdx = detectHeaderRow(rows);
        var headers = buildHeaders(rows, hIdx);
        var mapping = { id: null, username: null, kills: null, deaths: null, nation: null, total: null };
        var needsManual = false;

        if (hIdx === -1) {
            // Sin cabeceras reconocibles: mapeo manual obligatorio
            needsManual = true;
        } else {
            mapping = {
                id: orNull(findColumn(rows[hIdx], 'id')),
                username: orNull(findColumn(rows[hIdx], 'username')),
                kills: orNull(findColumn(rows[hIdx], 'kills')),
                deaths: orNull(findColumn(rows[hIdx], 'deaths')),
                nation: orNull(findColumn(rows[hIdx], 'nation')),
                total: orNull(findColumn(rows[hIdx], 'total'))
            };
            // Imprescindible: id y (kills+deaths o total)
            if (mapping.id === null ||
                ((mapping.kills === null || mapping.deaths === null) && mapping.total === null)) {
                needsManual = true;
            }
        }

        var parsed = { players: [], skippedBots: 0, errors: [] };
        if (!needsManual) parsed = parseRows(rows, mapping, hIdx);

        return {
            players: parsed.players,
            skippedBots: parsed.skippedBots,
            errors: parsed.errors,
            mapping: mapping,
            headers: headers,
            headerRowIndex: hIdx,
            needsManualMapping: needsManual
        };
    }

    // ===================== API PUBLICA =====================

    /**
     * Descarga y parsea el Excel K/D de una partida.
     * @param {string|number} gameId ID Supremacy de la partida (numerico).
     * @param {Object} [opts] { force: true } fuerza la descarga ignorando la
     *        cache (el rate limit de 10s se sigue respetando).
     * @returns {Promise<Object>} { players, skippedBots, errors, mapping,
     *          headers, headerRowIndex, needsManualMapping, rawRows,
     *          fromCache, cachedAt, gameId }
     * @throws Error con .code: INVALID_GAME_ID, RATE_LIMIT, LIBRARY, NETWORK,
     *         BLOCKED, NOT_FOUND, HTTP, FORMAT, NO_DATA
     */
    async function fetchKdExcel(gameId, opts) {
        opts = opts || {};
        var gid = String(gameId === null || gameId === undefined ? '' : gameId).trim();
        if (!/^\d+$/.test(gid)) {
            throw mkError('INVALID_GAME_ID', 'ID de partida invalido: debe ser numerico.');
        }

        // 1) Cache valida -> respuesta inmediata sin consumir rate limit
        if (!opts.force) {
            var cached = readCache(gid);
            if (cached && cached.parse) {
                var fromCache = clone(cached.parse);
                fromCache.rawRows = cached.rawRows;
                fromCache.fromCache = true;
                fromCache.cachedAt = cached.ts;
                fromCache.gameId = gid;
                return fromCache;
            }
        }

        // 2) Rate limit: 1 peticion cada 10s (tambien al forzar actualizacion)
        var remaining = getRateLimitRemaining();
        if (remaining > 0) {
            var rlErr = mkError('RATE_LIMIT', 'Limite de peticiones: espera ' + remaining + 's antes de reintentar.');
            rlErr.remaining = remaining;
            throw rlErr;
        }

        // 3) Descarga del Excel (SheetJS se carga bajo demanda)
        await loadXLSX();
        markFetch(); // la peticion consume el hueco aunque falle
        var resp;
        try {
            var fetchHeaders = { 'Accept': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, */*' };
            // Si usamos la Edge Function de Supabase, enviar el anon key por si la funcion requiere auth
            if (API_BASE.indexOf('/functions/v1/') !== -1 && typeof window !== 'undefined' && window.SUPABASE_ANON_KEY) {
                fetchHeaders['Authorization'] = 'Bearer ' + window.SUPABASE_ANON_KEY;
            }
            resp = await fetch(API_BASE + encodeURIComponent(gid), {
                headers: fetchHeaders
            });
        } catch (netErr) {
            throw mkError('NETWORK', 'Error de red o CORS al contactar con el servidor. Prueba el importador CSV como alternativa.');
        }

        if (!resp.ok) {
            if (resp.status === 429) throw mkError('RATE_LIMIT', 'El servidor esta limitando peticiones (HTTP 429). Espera unos segundos y reintenta.');
            if (resp.status === 403) throw mkError('BLOCKED', 'Acceso bloqueado por el servidor (HTTP 403). Posible proteccion anti-bot; intentalo mas tarde o usa el importador CSV.');
            if (resp.status === 404) throw mkError('NOT_FOUND', 'Partida no encontrada en el servidor (HTTP 404). Revisa el ID.');
            throw mkError('HTTP', 'Error HTTP ' + resp.status + ' al descargar el Excel.');
        }

        var buf;
        try { buf = await resp.arrayBuffer(); }
        catch (readErr) { throw mkError('NETWORK', 'No se pudo leer la respuesta del servidor.'); }
        if (!buf || buf.byteLength === 0) throw mkError('FORMAT', 'El servidor devolvio un archivo vacio.');

        // 4) Parseo XLSX (primera hoja)
        var wb;
        try { wb = window.XLSX.read(buf, { type: 'array' }); }
        catch (xlsxErr) { throw mkError('FORMAT', 'El archivo recibido no es un Excel .xlsx valido.'); }
        var firstSheet = wb.SheetNames && wb.SheetNames[0];
        if (!firstSheet) throw mkError('FORMAT', 'El Excel no contiene ninguna hoja.');
        var rows = window.XLSX.utils.sheet_to_json(wb.Sheets[firstSheet], { header: 1, raw: true, defval: null, blankrows: false });
        if (!rows || !rows.length) throw mkError('NO_DATA', 'El Excel no contiene filas de datos.');

        // 5) Auto-deteccion de estructura + parseo
        var result = autoParse(rows);
        result.rawRows = rows;
        result.fromCache = false;
        result.cachedAt = Date.now();
        result.gameId = gid;

        // 6) Guardar en cache (filas crudas + ultimo parseo)
        writeCache(gid, {
            ts: Date.now(),
            rawRows: rows,
            parse: {
                players: result.players,
                skippedBots: result.skippedBots,
                errors: result.errors,
                mapping: result.mapping,
                headers: result.headers,
                headerRowIndex: result.headerRowIndex,
                needsManualMapping: result.needsManualMapping
            }
        });
        return result;
    }

    /**
     * Reprocesa las filas crudas con un mapeo manual de columnas.
     * @param {Array} rawRows Filas crudas (array de arrays) del ultimo fetch.
     * @param {Object} mapping { id, username, kills, deaths, nation, total } indices o null.
     * @param {number} headerRowIndex Indice de la fila de cabeceras (-1 si no hay).
     * @param {string|number} [gameId] Si existe cache de ese gameId, actualiza
     *        el parseo cacheado con el resultado del mapeo manual.
     */
    function reparse(rawRows, mapping, headerRowIndex, gameId) {
        if (!rawRows || !rawRows.length) throw mkError('NO_DATA', 'No hay filas para reprocesar.');
        if (!mapping || mapping.id === null || mapping.id === undefined) {
            throw mkError('MAPPING', 'Mapeo invalido: falta la columna de ID.');
        }
        var hIdx = (typeof headerRowIndex === 'number') ? headerRowIndex : -1;
        var parsed = parseRows(rawRows, mapping, hIdx);
        var result = {
            players: parsed.players,
            skippedBots: parsed.skippedBots,
            errors: parsed.errors,
            mapping: mapping,
            headers: buildHeaders(rawRows, hIdx),
            headerRowIndex: hIdx,
            needsManualMapping: false,
            rawRows: rawRows
        };
        if (gameId) {
            var gid = String(gameId).trim();
            var cached = readCache(gid);
            if (cached) {
                cached.parse = {
                    players: result.players,
                    skippedBots: result.skippedBots,
                    errors: result.errors,
                    mapping: result.mapping,
                    headers: result.headers,
                    headerRowIndex: result.headerRowIndex,
                    needsManualMapping: false
                };
                writeCache(gid, cached);
            }
        }
        return result;
    }

    window.ApiKdImporter = {
        fetchKdExcel: fetchKdExcel,
        reparse: reparse,
        getRateLimitRemaining: getRateLimitRemaining,
        getCacheInfo: getCacheInfo,
        clearCache: clearCache,
        clearAllCache: clearAllCache,
        calcKd: calcKd,
        parseIntSafe: parseIntSafe,
        detectHeaderRow: detectHeaderRow,
        buildHeaders: buildHeaders,
        parseRows: parseRows,
        autoParse: autoParse,
        normHeader: normHeader,
        findColumn: findColumn,
        loadXLSX: loadXLSX,
        RATE_LIMIT_SECONDS: RATE_LIMIT_SECONDS,
        CACHE_TTL_MS: CACHE_TTL_MS
    };

    console.log('[ApiKdImporter] Modulo listo. SheetJS se cargara bajo demanda.');
})();
