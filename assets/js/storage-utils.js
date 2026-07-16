// assets/js/storage-utils.js v1 - Sistema de evidencia con compresion
// Depende de: config.js (supabase client)
// Bucket: 'evidence' (public)

// ========== CONFIGURACION ==========
var STORAGE_CONFIG = {
    bucket: 'evidence',
    maxWidth: 1200,
    quality: 0.7,
    maxFilesPerUpload: 3,
    maxFileSizeMB: 5,
    allowedTypes: ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif']
};

// ========== COMPRESION ==========

function compressImage(file) {
    return new Promise(function(resolve, reject) {
        if (!file || !file.type.startsWith('image/')) {
            resolve(file); // No es imagen, pasar tal cual
            return;
        }

        var reader = new FileReader();
        reader.onload = function(e) {
            var img = new Image();
            img.onload = function() {
                var canvas = document.createElement('canvas');
                var ctx = canvas.getContext('2d');

                var w = img.width;
                var h = img.height;

                // Redimensionar si es mas ancha que maxWidth
                if (w > STORAGE_CONFIG.maxWidth) {
                    h = Math.round(h * (STORAGE_CONFIG.maxWidth / w));
                    w = STORAGE_CONFIG.maxWidth;
                }

                canvas.width = w;
                canvas.height = h;
                ctx.drawImage(img, 0, 0, w, h);

                // Convertir a WebP con calidad 0.7 (mejor compresion que JPEG)
                canvas.toBlob(function(blob) {
                    if (!blob) { reject(new Error('Error comprimiendo imagen')); return; }
                    var compressed = new File([blob], file.name.replace(/\.[^.]+$/, '.webp'), {
                        type: 'image/webp',
                        lastModified: Date.now()
                    });
                    console.log('[Storage] Original: ' + (file.size / 1024).toFixed(1) + 'KB -> Comprimido: ' + (compressed.size / 1024).toFixed(1) + 'KB');
                    resolve(compressed);
                }, 'image/webp', STORAGE_CONFIG.quality);
            };
            img.onerror = function() { reject(new Error('Error cargando imagen')); };
            img.src = e.target.result;
        };
        reader.onerror = function() { reject(new Error('Error leyendo archivo')); };
        reader.readAsDataURL(file);
    });
}

// ========== UPLOAD ==========

function uploadEvidence(file, folderPath) {
    return new Promise(function(resolve, reject) {
        if (!file) { reject(new Error('No file provided')); return; }

        // Validar tamano
        if (file.size > STORAGE_CONFIG.maxFileSizeMB * 1024 * 1024) {
            reject(new Error('Archivo demasiado grande (max ' + STORAGE_CONFIG.maxFileSizeMB + 'MB)'));
            return;
        }

        // Validar tipo
        var isImage = file.type.startsWith('image/');
        var isVideo = file.type.startsWith('video/');
        if (!isImage && !isVideo) {
            reject(new Error('Solo se permiten imagenes y videos'));
            return;
        }

        var fileName = Date.now() + '_' + file.name.replace(/[^a-zA-Z0-9.]/g, '_');
        var filePath = folderPath + '/' + fileName;

        supabase.storage
            .from(STORAGE_CONFIG.bucket)
            .upload(filePath, file, {
                cacheControl: '3600',
                upsert: false
            })
            .then(function(result) {
                if (result.error) { reject(result.error); return; }

                // Obtener URL publica
                var { data } = supabase.storage
                    .from(STORAGE_CONFIG.bucket)
                    .getPublicUrl(filePath);

                resolve(data.publicUrl);
            })
            .catch(function(err) { reject(err); });
    });
}

// ========== PIPELINE COMPLETO ==========

async function compressAndUpload(files, targetType, targetId) {
    if (!files || files.length === 0) return [];

    var results = [];
    var limit = Math.min(files.length, STORAGE_CONFIG.maxFilesPerUpload);
    var folderPath = targetType + '/' + targetId;

    for (var i = 0; i < limit; i++) {
        try {
            var compressed = await compressImage(files[i]);
            var url = await uploadEvidence(compressed, folderPath);
            results.push(url);
        } catch(e) {
            console.error('[Storage] Error subiendo archivo ' + (i + 1) + ':', e);
        }
    }

    return results;
}

// ========== UTILIDADES UI ==========

function renderEvidenceGrid(urls, containerId) {
    var container = document.getElementById(containerId);
    if (!container || !urls || urls.length === 0) return;

    container.innerHTML = '<div class="grid grid-cols-3 gap-2 mt-3">' +
        urls.map(function(url) {
            var isVideo = url.match(/\.(mp4|webm|mov)$/i);
            if (isVideo) {
                return '<div class="relative rounded-lg overflow-hidden" style="border:1px solid #1a237e;">' +
                    '<video src="' + url + '" class="w-full h-20 object-cover" controls preload="metadata"></video>' +
                    '<span class="absolute top-1 right-1 text-[8px] px-1 rounded font-bold" style="background:rgba(0,0,0,0.7);color:#fff;">VIDEO</span></div>';
            }
            return '<a href="' + url + '" target="_blank" class="block rounded-lg overflow-hidden" style="border:1px solid #1a237e;">' +
                '<img src="' + url + '" class="w-full h-20 object-cover hover:opacity-80 transition" alt="evidencia" loading="lazy">' +
                '</a>';
        }).join('') + '</div>';
}

// ========== EXPORTS ==========
window.compressImage = compressImage;
window.uploadEvidence = uploadEvidence;
window.compressAndUpload = compressAndUpload;
window.renderEvidenceGrid = renderEvidenceGrid;
window.STORAGE_CONFIG = STORAGE_CONFIG;
