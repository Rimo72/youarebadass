-- ============================================================
--  You Are Badass — admin access + new-submission email
--  Run in Supabase → SQL Editor AFTER supabase-setup.sql.
--  Re-runnable.
--
--  Prerequisite for the email part: the Resend key must be in
--  Vault under the name 'resend_api_key' (see supabase-secret.local.sql,
--  or add it via Dashboard → Project Settings → Vault).
-- ============================================================

-- ------------------------------------------------------------
-- 1. Who is the admin?  (change the address here if it ever moves)
-- ------------------------------------------------------------
create or replace function public.is_experience_admin()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'email', '') = 'rimo72.rm@gmail.com'
$$;

-- ------------------------------------------------------------
-- 2. Let a signed-in admin read every row and change the status.
--    Non-admin signed-in users get nothing (RLS filters them out)
--    and cannot write (the WITH CHECK fails).
-- ------------------------------------------------------------
grant select on public.experiences to authenticated;
grant update (status, published_at) on public.experiences to authenticated;

drop policy if exists "admin can read every experience" on public.experiences;
create policy "admin can read every experience"
  on public.experiences for select
  to authenticated
  using ( public.is_experience_admin() );

drop policy if exists "admin can moderate experiences" on public.experiences;
create policy "admin can moderate experiences"
  on public.experiences for update
  to authenticated
  using ( public.is_experience_admin() )
  with check ( public.is_experience_admin() );

-- ------------------------------------------------------------
-- 3. Email on every new submission (via Resend, using pg_net).
--    The insert never fails because of the email: any problem is
--    logged as a warning and the row still saves.
-- ------------------------------------------------------------
create extension if not exists pg_net;

create or replace function public.notify_new_experience()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key   text;
  v_admin text := 'rimo72.rm@gmail.com';
  v_site  text := 'https://youarebadass.ca';
  v_who   text;
  v_exp   text;
  v_html  text;
  v_body  jsonb;
begin
  select decrypted_secret into v_key
  from vault.decrypted_secrets
  where name = 'resend_api_key';

  if v_key is null then
    raise warning 'notify_new_experience: resend_api_key not found in Vault — email skipped';
    return new;
  end if;

  v_who := case
             when new.anonymous or coalesce(btrim(new.name), '') = '' then 'Anonymous'
             else btrim(new.name)
           end;
  v_who := replace(replace(replace(v_who, '&', '&amp;'), '<', '&lt;'), '>', '&gt;');
  v_exp := replace(replace(replace(coalesce(new.experience, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;');

  v_html :=
       '<div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:520px;color:#111">'
    || '<h2 style="margin:0 0 12px">New experience submitted</h2>'
    || '<p style="margin:0 0 4px"><strong>From:</strong> ' || v_who
    || case when new.rating is not null
            then ' &nbsp;&middot;&nbsp; <strong>Rating:</strong> ' || new.rating::text || '/5'
            else '' end
    || '</p>'
    || '<blockquote style="margin:12px 0;padding:10px 14px;border-left:3px solid #f5c518;background:#faf7ec;white-space:pre-wrap">'
    || v_exp
    || '</blockquote>'
    || '<p style="margin:18px 0 0"><a href="' || v_site || '/admin" '
    || 'style="display:inline-block;background:#f5c518;color:#1a1a1a;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:700">Review in admin</a></p>'
    || '<p style="color:#999;font-size:12px;margin-top:16px">id ' || new.id::text || ' &middot; ' || new.created_at::text || '</p>'
    || '</div>';

  v_body := jsonb_build_object(
    'from', 'You Are Badass <onboarding@resend.dev>',
    'to', jsonb_build_array(v_admin),
    'subject', 'New experience from ' || v_who,
    'html', v_html
  );
  if new.email is not null and not new.anonymous then
    v_body := v_body || jsonb_build_object('reply_to', new.email);
  end if;

  begin
    perform net.http_post(
      url     => 'https://api.resend.com/emails',
      headers => jsonb_build_object(
        'Authorization', 'Bearer ' || v_key,
        'Content-Type', 'application/json'
      ),
      body    => v_body
    );
  exception when others then
    raise warning 'notify_new_experience: send failed: %', sqlerrm;
  end;

  return new;
end;
$$;

drop trigger if exists trg_notify_new_experience on public.experiences;
create trigger trg_notify_new_experience
  after insert on public.experiences
  for each row execute function public.notify_new_experience();

notify pgrst, 'reload schema';

-- ------------------------------------------------------------
-- Quick checks
--   select public.is_experience_admin();          -- run while logged in via the app
--   select name from vault.secrets;               -- should list 'resend_api_key'
--   -- then submit a test row from the site and watch your inbox
-- ------------------------------------------------------------
