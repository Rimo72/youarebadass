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
| `card.png` | The card artwork |
| `vercel.json` | Security headers / Content-Security-Policy |
| `supabase-setup.sql` | One-time database hardening — **run this in Supabase** |

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

## Moderating submissions

New entries land as `pending` and are invisible on the site. In the Supabase
table editor (or SQL editor):

```sql
-- see the queue
select id, created_at, rating, name, left(experience, 80)
from public.experiences where status = 'pending' order by created_at desc;

-- approve
update public.experiences
set status = 'published', published_at = now()
where id = <id>;

-- reject
update public.experiences set status = 'rejected' where id = <id>;
```

## Security notes

- **No secrets in the repo.** The Supabase key in `app.js` is the *publishable*
  key — it is meant to be public and only grants what the RLS policies above
  allow (insert a pending row; read the safe view).
- **XSS:** every value coming from the database is rendered with
  `textContent` / `createElement`, never `innerHTML`. Submitted text cannot
  inject markup or script.
- **Strict CSP** (`vercel.json`): `script-src 'self'` + Google Analytics only,
  no `unsafe-inline`. Plus `nosniff`, `X-Frame-Options: DENY`,
  `frame-ancestors 'none'`, locked-down `Permissions-Policy`, HSTS.
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
