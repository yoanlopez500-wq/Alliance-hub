// assets/js/config.js
// Configuracion de Supabase - inicializacion robusta
var SUPABASE_URL = 'https://qkccyjegkgjzwoxytnqp.supabase.co';
var SUPABASE_ANON_KEY = 'sb_publishable_-BBqDHD9LrMiPrk6CihrKA_8p_ABQCK';
var VAPID_PUBLIC_KEY = 'gNjAYfjWRKVE6JoNuj_CxK_JrDE07NssWfwfSHNnWklv7Hn7A23tbm6xXUZXCnFxB87Lrivhgy_yHJqakiI01Q';
window.SUPABASE_URL = SUPABASE_URL;
window.SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;
window.VAPID_PUBLIC_KEY = VAPID_PUBLIC_KEY;

// FIX: Asegurar que window.supabase se inicialice correctamente y notificar cuando este listo
function initSupabaseClient(attempts) {
    attempts = attempts || 0;
    if (typeof window.supabase !== 'undefined' && typeof window.supabase.createClient === 'function') {
        try {
            window.supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { db: { schema: 'public' }, auth: { persistSession: true, autoRefreshToken: true } });
            console.log('[Config] Supabase inicializado correctamente');
            // Dispatch evento para que los page scripts sepan que supabase esta listo
            window.dispatchEvent(new CustomEvent('ah:supabase-ready'));
        } catch (e) {
            console.error('[Config] Error creando cliente Supabase:', e);
        }
        return;
    }
    if (attempts < 50) {
        setTimeout(function() { initSupabaseClient(attempts + 1); }, 100);
    } else {
        console.error('[Config] No se pudo inicializar Supabase: CDN no cargo despues de 5 segundos');
    }
}
initSupabaseClient();
