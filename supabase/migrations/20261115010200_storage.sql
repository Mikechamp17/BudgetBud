-- Private buckets for statement files and receipt photos.
-- Each user's files live under a folder named with their user id.

insert into storage.buckets (id, name, public)
values ('statements', 'statements', false), ('receipts', 'receipts', false)
on conflict (id) do nothing;

create policy "Users read own statement and receipt files" on storage.objects for select to authenticated
  using (bucket_id in ('statements', 'receipts') and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Users upload own statement and receipt files" on storage.objects for insert to authenticated
  with check (bucket_id in ('statements', 'receipts') and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Users update own statement and receipt files" on storage.objects for update to authenticated
  using (bucket_id in ('statements', 'receipts') and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id in ('statements', 'receipts') and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Users delete own statement and receipt files" on storage.objects for delete to authenticated
  using (bucket_id in ('statements', 'receipts') and (storage.foldername(name))[1] = (select auth.uid())::text);
