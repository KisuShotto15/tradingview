-- Migration 04: chart snapshot storage
-- Run this in your Supabase SQL Editor.
--
-- Creates a public bucket for chart screenshots. Public READ is deliberate:
-- the whole point is a URL that renders anywhere it is pasted (a trading
-- journal, Notion, Discord), and those fetch the image without credentials.
-- Writes stay locked to the owner via the per-user path prefix `<uid>/<file>`,
-- so a link is only guessable, never listable or writable by anyone else.

insert into storage.buckets (id, name, public)
values ('snapshots', 'snapshots', true)
on conflict (id) do update set public = true;

-- Owner-only writes, keyed on the first path segment being the user's id.
drop policy if exists "Users upload their own snapshots" on storage.objects;
create policy "Users upload their own snapshots"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'snapshots'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users update their own snapshots" on storage.objects;
create policy "Users update their own snapshots"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'snapshots'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users delete their own snapshots" on storage.objects;
create policy "Users delete their own snapshots"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'snapshots'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Anyone with the URL can read (required for the link to render externally).
drop policy if exists "Snapshots are publicly readable" on storage.objects;
create policy "Snapshots are publicly readable"
  on storage.objects for select
  using (bucket_id = 'snapshots');
