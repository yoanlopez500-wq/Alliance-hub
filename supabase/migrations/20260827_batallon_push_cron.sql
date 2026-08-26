create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Guard: re-programar si ya existen
do $$
begin
  perform cron.unschedule('batallon-reminder-morning');
  exception when others then null;
end $$;
do $$
begin
  perform cron.unschedule('batallon-reminder-afternoon');
  exception when others then null;
end $$;

select cron.schedule('batallon-reminder-morning', '0 14 * * *', $$
  select net.http_post(
    url := 'https://qkccyjegkgjzwoxytnqp.supabase.co/functions/v1/push-notify',
    headers := jsonb_build_object('Content-Type','application/json','x-hook-secret',(select value from public.push_config where key='hook_secret')),
    body := '{"event":"batallon_reminder","slot":"morning"}'::jsonb
  );
$$);

select cron.schedule('batallon-reminder-afternoon', '0 21 * * *', $$
  select net.http_post(
    url := 'https://qkccyjegkgjzwoxytnqp.supabase.co/functions/v1/push-notify',
    headers := jsonb_build_object('Content-Type','application/json','x-hook-secret',(select value from public.push_config where key='hook_secret')),
    body := '{"event":"batallon_reminder","slot":"afternoon"}'::jsonb
  );
$$);
