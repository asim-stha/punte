-- makes the table the backend uses
-- docker runs this once, when the database container starts with an empty volume
-- one row per user: faces = saved face numbers (128 each, no photos), mem = what punte remembers + recent chat
-- same columns as the supabase table so the mirror works
create table if not exists user_data (
  owner_id   text primary key,
  faces      jsonb not null default '[]'::jsonb,
  mem        jsonb not null default '{"facts":[],"chat":[]}'::jsonb,
  updated_at timestamptz not null default now()
);
