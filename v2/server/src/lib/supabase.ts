import { createClient } from '@supabase/supabase-js';
import { config } from '../config';

// UNICA instancia service_role del proceso. Vive solo en el servidor:
// el browser jamas recibe esta key (el frontend usa la anon key para
// lecturas publicas y este server para todo lo demas).
export const supabase = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
