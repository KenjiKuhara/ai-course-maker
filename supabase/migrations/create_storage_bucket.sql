-- Storage Bucketの作成 (submissions)
insert into storage.buckets (id, name, public) 
values ('submissions', 'submissions', true)
on conflict (id) do nothing;

-- ポリシー設定 (Storage Objects)

-- 1. 誰でも(学生)アップロード可能にする
-- (今回は簡単にするためPublicにしてますが、本番では認証チェックを厳密にすべき)
create policy "Anyone can upload submissions" on storage.objects
for insert with check (bucket_id = 'submissions');

-- 2. 誰でも閲覧(ダウンロード)可能にする
create policy "Anyone can view submissions" on storage.objects
for select using (bucket_id = 'submissions');

-- 3. 誰でも更新(上書き)可能にする
create policy "Anyone can update submissions" on storage.objects
for update using (bucket_id = 'submissions');

-- 4. 誰でも削除可能にする(再提出などのため)
create policy "Anyone can delete submissions" on storage.objects
for delete using (bucket_id = 'submissions');
