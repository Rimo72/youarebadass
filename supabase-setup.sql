-- ============================================================
--  You Are Badass  —  lock down & wire up  public.experiences
--  Run ONCE in the Supabase dashboard → SQL Editor → New query → Run.
--
--  IMPORTANT: this REPLACES every policy / grant currently on the
--  table. Right now the table is wide open — anonymous visitors can
--  read?, insert, UPDATE and DELETE any row. This script closes all
--  of that and leaves exactly one door open: "insert a pending
--  review". Re-runnable.
-- ============================================================

-- ------------------------------------------------------------
-- 0. (optional) wipe test data so the identity counter restarts.
--    Comment this out if you already have real submissions.
-- ------------------------------------------------------------
truncate table public.experiences restart identity;

-- ------------------------------------------------------------
-- 1. Drop ALL existing policies on the table (clean slate)
-- ------------------------------------------------------------
do $$
declare p record;
begin
  for p in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'experiences'
  loop
    execute format('drop policy %I on public.experiences', p.policyname);
  end loop;
end $$;

-- ------------------------------------------------------------
-- 2. Drop existing CHECK constraints, then add our own
--    (kept separate so a stale status/whitelist check can't
--     block the 'pending' default)
-- ------------------------------------------------------------
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.experiences'::regclass and contype = 'c'
  loop
    execute format('alter table public.experiences drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.experiences
  add constraint experiences_experience_len
    check (char_length(experience) between 10 and 2000),
  add constraint experiences_name_len
    check (name is null or char_length(name) <= 80),
  add constraint experiences_email_len
    check (email is null or char_length(email) <= 254),
  add constraint experiences_rating_range
    check (rating is null or rating between 1 and 5),
  add constraint experiences_status_whitelist
    check (status in ('pending', 'published', 'rejected'));

-- ------------------------------------------------------------
-- 3. Column defaults
-- ------------------------------------------------------------
alter table public.experiences alter column status     set default 'pending';
alter table public.experiences alter column anonymous  set default false;
alter table public.experiences alter column created_at set default now();

-- ------------------------------------------------------------
-- 4. Privileges: revoke everything, hand back only a
--    column-scoped INSERT for the public.
-- ------------------------------------------------------------
revoke all on table public.experiences from anon, authenticated;
grant  insert (name, email, experience, rating, anonymous)
  on table public.experiences to anon;

-- ------------------------------------------------------------
-- 5. Row Level Security: exactly one policy — insert a pending row
-- ------------------------------------------------------------
alter table public.experiences enable row level security;

create policy "public can submit a pending experience"
  on public.experiences
  for insert
  to anon
  with check (
    status = 'pending'
    and published_at is null
    and char_length(experience) between 10 and 2000
    and (name  is null or char_length(name)  <= 80)
    and (email is null or char_length(email) <= 254)
    and (rating is null or rating between 1 and 5)
  );

-- No SELECT / UPDATE / DELETE policy  → anon & authenticated cannot
-- read, change or remove rows. Moderation happens with the service
-- role (Supabase dashboard), which bypasses RLS.

-- ------------------------------------------------------------
-- 6. The ONLY thing the website can read: a safe projection.
--    Never exposes email; hides name when anonymous; published only.
--    security_invoker = false is deliberate — the view runs with its
--    owner's rights to read the locked table, exposing just 5 columns.
-- ------------------------------------------------------------
create or replace view public.published_experiences
with (security_invoker = false) as
  select
    id,
    experience,
    rating,
    case when anonymous then null else nullif(btrim(name), '') end as display_name,
    coalesce(published_at, created_at) as shown_at
  from public.experiences
  where status = 'published';

revoke all on table public.published_experiences from anon, authenticated;
grant select on table public.published_experiences to anon, authenticated;

-- ------------------------------------------------------------
-- 7. Refresh PostgREST
-- ------------------------------------------------------------
notify pgrst, 'reload schema';

-- ============================================================
--  Moderation
--  --------------------------------------------------------------
--  Queue:    select id, created_at, rating, name, left(experience,80)
--            from public.experiences where status = 'pending'
--            order by created_at desc;
--
--  Approve:  update public.experiences
--            set status = 'published', published_at = now() where id = $1;
--
--  Reject:   update public.experiences set status = 'rejected' where id = $1;
-- ============================================================
