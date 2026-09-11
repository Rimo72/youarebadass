# youarebadass

A one-page site for the *You Are Badass* card, plus a moderated wall of
user-submitted experiences backed by Supabase.

Live: https://youarebadass.vercel.app · https://youarebadass.ca

## Files

| File | Purpose |
|------|---------|
| `index.html` | Markup only — no inline script or style |
| `styles.css` | All styling |
| `app.js` | Heart toggle, experiences ticker, submission form, GA config |
| `admin.html` / `admin.js` | `/admin` — magic-link login + moderation queue |
| `vendor/supabase.min.js` | Vendored Supabase JS client (used only by the admin page) |
| `card.png` | The card artwork |
| `vercel.json` | Security headers / Content-Security-Policy / clean URLs |
| `supabase-setup.sql` | One-time database hardening — **run first** |
| `supabase-admin.sql` | Admin RLS + new-submission email trigger — **run second** |
| `supabase-secret.local.sql` | Puts the Resend key in Vault — git-ignored, run once |

## First-time Supabase setup — REQUIRED

> As it stands the `experiences` table is **wide open**: anonymous callers can
> insert, update and delete any row. The script below closes that. Run it
> before relying on the site.

1. Open the Supabase dashboard → **SQL Editor** → **New query**.
2. Paste the contents of [`supabase-setup.sql`](supabase-setup.sql) and **Run**.

That script:

- **drops every existing policy, grant and check constraint** on the table;
- `truncate`s the table (clears test rows / resets the id counter — comment
  that line out if you already have real submissions);
- lets anonymous visitors INSERT only into `name, email, experience, rating,
  anonymous`, and only as a `status = 'pending'` row (enforced by an RLS
  `WITH CHECK` policy *and* table `CHECK` constraints);
- gives anon **no** SELECT / UPDATE / DELETE on the table;
- creates a `published_experiences` **view** — the only thing the site reads.
  It never exposes `email`, hides `name` for anonymous entries, and shows only
  rows with `status = 'published'`.

## Admin page + email notifications

`/admin` is a private moderation page. New submissions email you a link to it.

### Admin sign-in

Primary login is **email + password**. Create the user once:
**Supabase → Authentication → Users → Add user** → the admin email, a password,
**Auto Confirm User = on**. No email is sent, no rate limits.

A one-time email code ("Email me a one-time code instead") is a fallback — it
uses Supabase Auth email, which on the free shared sender is throttled to a
couple per hour unless you set custom SMTP (below).

### One-time setup

1. **Resend** (notification-email delivery): create a free account at resend.com
   with the admin email, then **API Keys → Create** (Sending access). No domain
   verification needed — unverified accounts send from `onboarding@resend.dev`
   to the account's own address, which is all this needs.
2. Put the key in Vault: paste it into `supabase-secret.local.sql` (git-ignored)
   and run that file in the SQL editor — *or* add a secret named
   `resend_api_key` in **Dashboard → Project Settings → Vault**.
3. Run [`supabase-admin.sql`](supabase-admin.sql) in the SQL editor. It:
   - adds `is_experience_admin()` — checks the signed-in email against the
     hard-coded admin address (change it there if it moves);
   - lets that one admin `SELECT` every row, `UPDATE (status, published_at)`,
     and `DELETE`; non-admin signed-in users still see nothing and can write
     nothing;
   - installs an `AFTER INSERT` trigger that calls Resend via `pg_net`. The
     insert never fails on a mail problem — it just logs a warning.

   *(Re-run this file whenever it changes — every statement is idempotent.)*
4. **Dashboard → Authentication → URL Configuration**: set the Site URL to
   `https://youarebadass.ca` and add redirect URLs
   `https://youarebadass.ca/admin` and `https://youarebadass.vercel.app/admin`.
5. *(optional)* **Authentication → Emails → SMTP Settings** → point at Resend
   (`smtp.resend.com`, port 465, user `resend`, password = the API key,
   sender `onboarding@resend.dev`) so the fallback code emails aren't throttled.
   Not needed if you only ever use password login.

### How access is locked down

`/admin` lists every experience newest-first with its status; each row has
Approve / Reject / Delete.

The `/admin` HTML is public, but useless without a session. The RLS policies
check the **exact email address** on the logged-in user, so anyone who manages
to sign in with a different account sees an empty list and every write is
refused.

### Moderating by hand (fallback)

```sql
select id, created_at, rating, name, left(experience, 80)
from public.experiences where status = 'pending' order by created_at desc;

update public.experiences
set status = 'published', published_at = now() where id = <id>;   -- approve
update public.experiences set status = 'rejected' where id = <id>; -- reject
```

## Security notes

- **No secrets in the repo.** The Supabase key in `app.js` is the *publishable*
  key — it is meant to be public and only grants what the RLS policies above
  allow (insert a pending row; read the safe view).
- **XSS:** every value coming from the database is rendered with
  `textContent` / `createElement`, never `innerHTML`. Submitted text cannot
  inject markup or script.
- **Strict CSP** (`vercel.json`): `script-src 'self'` + Google Analytics only,
  no `unsafe-inline`. The Supabase client is vendored (`vendor/`), not loaded
  from a CDN, so the admin page keeps the same policy. Plus `nosniff`,
  `X-Frame-Options: DENY`, `frame-ancestors 'none'`, locked `Permissions-Policy`,
  HSTS.
- **Admin:** gated by Supabase Auth; RLS checks the exact admin email, so the
  public `/admin` page grants nothing without a valid session for that address.
- **Resend key:** lives in Supabase Vault, read only by a `security definer`
  trigger. Never in the repo (`*.local.sql` is git-ignored).
- **Abuse:** honeypot field, 60-second client-side submit throttle, DB-level
  length/rating/status constraints. For heavier bot traffic, add Cloudflare
  Turnstile or hCaptcha to the form.
- **SQL injection:** not reachable — PostgREST parameterises every query.

## Local preview

Serve the folder over HTTP (not `file://`, or the fetch calls and CSP behave
differently):

```bash
npx serve .
```

The carousel and form need the SQL above to have been run against the live
Supabase project; until then they show an empty/error state, which is expected.
