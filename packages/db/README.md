# @pcg/db

Migrations are plain SQL, applied in order through the Supabase CLI's linked connection (Management API — no DB password needed):

    for f in packages/db/migrations/*.sql; do supabase db query --linked -f "$f" || break; done

The repo is linked to project `nbemewketprkcyhewxos` (`supabase/.temp/project-ref`). Ad-hoc SQL: `supabase db query --linked "select count(*) from products"`.
Migrations are not idempotent; apply each exactly once. Add new files as `NNNN_name.sql`.
