-- 20261018_storage_upload_guard.sql
-- Blindaje del storage publico: los buckets public-assets, evidence y
-- report-evidence aceptan INSERT anonimo por diseno (evidencias de reportes,
-- avatares, imagenes de anuncios), pero sin validacion cualquiera con la
-- anon key podia subir archivos de cualquier tipo y tamano (llenado de
-- bucket, malware servido desde el dominio de Supabase).
-- Este trigger valida tamano maximo (15 MB) y lista blanca de MIME types
-- server-side, independientemente del cliente. El SVG se excluye a proposito
-- (XSS activo si se sirve con content-type image/svg+xml).
create or replace function public.storage_upload_guard()
returns trigger
language plpgsql
as $$
begin
  if (new.bucket_id in ('public-assets', 'evidence', 'report-evidence')) then
    if coalesce((new.metadata ->> 'size')::bigint, 0) > 15728640 then
      raise exception 'Archivo demasiado grande (maximo 15 MB)';
    end if;
    if new.metadata ->> 'mimetype' is null
       or new.metadata ->> 'mimetype' !~* '^(image/(png|jpe?g|gif|webp|avif)|application/pdf|video/(mp4|webm))$' then
      raise exception 'Tipo de archivo no permitido';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists storage_upload_guard_trigger on storage.objects;
create trigger storage_upload_guard_trigger
  before insert on storage.objects
  for each row execute function public.storage_upload_guard();
