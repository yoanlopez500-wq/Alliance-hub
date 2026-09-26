-- 20260926: notas internas de jugador + guarda global de rate limit para el importador API.
-- Ambas son aditivas y seguras: no toca tablas existentes ni politicas previas.

-- ============================ player_notes ============================
-- Notas PRIVADAS (no publicas, a diferencia de los reportes). Append-only:
-- no hay politicas UPDATE/DELETE, nadie puede editar ni borrar una nota.
--   alliance_id IS NULL     -> nota de staff (visible solo a admins activos).
--   alliance_id NOT NULL    -> nota privada de esa alianza (lideres/oficiales).
-- Quien y cuando: author_id (auth.uid), author_name, author_role y created_at
-- se fijan en el INSERT (with_check); el autor solo puede ser uno mismo.
create table if not exists public.player_notes (
  id          uuid primary key default gen_random_uuid(),
  player_id   bigint not null references public.players(id) on delete cascade,
  alliance_id uuid references public.alliances(id) on delete cascade,
  body        text not null check (trim(body) <> ''),
  author_id   uuid not null default auth.uid(),
  author_name text not null,
  author_role text not null,
  created_at  timestamptz not null default now()
);

create index if not exists player_notes_player_idx on public.player_notes (player_id, created_at desc);
create index if not exists player_notes_alliance_idx on public.player_notes (alliance_id, created_at desc);

alter table public.player_notes enable row level security;

-- SELECT: staff ve las notas globales; el ambito de alianza usa el mismo
-- helper que ya gobierna strikes/miembros: can_view_alliance_scope().
drop policy if exists player_notes_select on public.player_notes;
create policy player_notes_select on public.player_notes for select to authenticated
  using (
    (alliance_id is null and public.is_active_admin())
    or (alliance_id is not null and public.can_view_alliance_scope(alliance_id))
  );

-- INSERT: el autor es auth.uid() (con with_check nadie suplanta a otro),
-- staff puede crear notas globales; lideres/oficiales solo notas de su
-- alianza y solo sobre miembros aprobados de esa alianza.
drop policy if exists player_notes_insert on public.player_notes;
create policy player_notes_insert on public.player_notes for insert to authenticated
  with check (
    author_id = auth.uid()
    and (
      (alliance_id is null and public.is_active_admin())
      or (
        alliance_id is not null
        and public.is_alliance_manager(alliance_id)
        and exists (
          select 1 from public.alliance_memberships am
          where am.alliance_id = player_notes.alliance_id
            and am.player_id = player_notes.player_id
            and am.status = 'approved'
        )
      )
    )
  );

-- Sin politicas UPDATE/DELETE: append-only por diseno.

grant select, insert on public.player_notes to authenticated;

-- ===================== api_import_guard (rate limit global) =====================
-- Regla de negocio: la importacion por API (kd-excel-proxy) NUNCA puede
-- ejecutarse a un ritmo menor de 10 segundos; aplicamos 15s GLOBALES (no por
-- usuario): una sola fila, un unico "permiso" atomico para todo el mundo.
create table if not exists public.api_import_guard (
  key text primary key,
  last_run_at timestamptz not null default now() - interval '1 hour'
);

-- Fila unica global. El "1 hour" inicial evita que el primer despliegue falle.
insert into public.api_import_guard (key, last_run_at)
values ('global', now() - interval '1 hour')
on conflict (key) do nothing;

-- Adquiere el permiso de forma ATOMICA: solo una llamada concurrente gana.
-- Intervalo: 15 segundos (nunca menor de 10, con margen de seguridad).
create or replace function public.api_import_acquire()
returns boolean
language sql
security definer
set search_path = public
as $$
  update public.api_import_guard
     set last_run_at = now()
   where key = 'global'
     and last_run_at < now() - interval '15 seconds'
  returning true;
$$;

-- Nadie toca la tabla directamente; solo la funcion (y solo de lectura la tabla).
revoke all on public.api_import_guard from anon, authenticated;
grant execute on function public.api_import_acquire() to anon, authenticated;
