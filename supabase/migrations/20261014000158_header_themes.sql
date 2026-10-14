-- =============================================================================
-- mysaf-off — Tema Header Utama (perayaan / hari jadi)
--
-- Jalankan SELEPAS 20261014000157. Hanya table/bucket/fungsi BAHARU — tiada
-- data sedia ada disentuh, jadi tiada snapshot dijana. Idempotent.
--
-- Super Admin memuat naik latar header (PNG/WebP) dan menetapkan tarikh
-- perayaan satu per satu. Header skrin Utama memaparkan:
--   1. tema hari jadi, jika hari ini hari jadi ahli itu sendiri (NRIC), ELSE
--   2. tema perayaan yang aktif pada tarikh hari ini (waktu Malaysia), ELSE
--   3. tiada (klien kekal hijau biasa).
-- =============================================================================

create table if not exists public.header_themes (
  id            uuid primary key default gen_random_uuid(),
  nama          text not null check (char_length(btrim(nama)) between 2 and 80),
  jenis         text not null check (jenis in ('perayaan', 'hari_jadi')),
  mula          date,
  tamat         date,
  image_mobile  text not null check (image_mobile ~ '^tema-[0-9]{10,16}-m\.(png|webp)$'),
  image_desktop text check (image_desktop is null or image_desktop ~ '^tema-[0-9]{10,16}-d\.(png|webp)$'),
  aktif         boolean not null default true,
  created_at    timestamptz not null default now(),
  constraint header_themes_tarikh_ok check (
    (jenis = 'perayaan' and mula is not null and tamat is not null and tamat >= mula)
    or (jenis = 'hari_jadi' and mula is null and tamat is null)
  )
);

-- Hanya satu tema hari jadi.
create unique index if not exists header_themes_satu_hari_jadi
  on public.header_themes (jenis) where jenis = 'hari_jadi';

alter table public.header_themes enable row level security;

drop policy if exists header_themes_read on public.header_themes;
create policy header_themes_read on public.header_themes
  for select to authenticated using (public.can_read_shared());

drop policy if exists header_themes_write on public.header_themes;
create policy header_themes_write on public.header_themes
  for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

revoke all on public.header_themes from anon;
grant select, insert, update, delete on public.header_themes to authenticated;

-- -----------------------------------------------------------------------------
-- RPC: tema yang patut dipaparkan kepada pemanggil hari ini.
-- -----------------------------------------------------------------------------
create or replace function public.my_header_theme()
returns table (nama text, jenis text, image_mobile text, image_desktop text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  hari date := (now() at time zone 'Asia/Kuala_Lumpur')::date;
  digit text;
  yy int; mm int; dd int; yyyy int;
  hari_jadi boolean := false;
begin
  if not public.can_read_shared() then
    return;
  end if;

  select regexp_replace(coalesce(m.nric, ''), '\D', '', 'g') into digit
  from public.members m
  where m.id = public.my_member_id() and not m.disekat;

  if digit ~ '^\d{12}$' then
    yy := substr(digit, 1, 2)::int;
    mm := substr(digit, 3, 2)::int;
    dd := substr(digit, 5, 2)::int;
    yyyy := case when yy > (extract(year from hari)::int % 100) then 1900 + yy else 2000 + yy end;
    if mm between 1 and 12
       and dd between 1 and extract(day from (make_date(yyyy, mm, 1) + interval '1 month' - interval '1 day'))::int
       and mm = extract(month from hari)::int
       and dd = extract(day from hari)::int then
      hari_jadi := true;
    end if;
  end if;

  if hari_jadi then
    return query
      select t.nama, t.jenis, t.image_mobile, t.image_desktop
      from public.header_themes t
      where t.jenis = 'hari_jadi' and t.aktif
      limit 1;
    if found then return; end if;
  end if;

  return query
    select t.nama, t.jenis, t.image_mobile, t.image_desktop
    from public.header_themes t
    where t.jenis = 'perayaan' and t.aktif and hari between t.mula and t.tamat
    order by t.mula desc, t.created_at desc
    limit 1;
end;
$$;

revoke all on function public.my_header_theme() from public, anon;
grant execute on function public.my_header_theme() to authenticated;

-- -----------------------------------------------------------------------------
-- Bucket awam; TULISAN dikunci kepada Super Admin.
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('header-themes', 'header-themes', true, 2097152, array['image/png', 'image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = 2097152,
      allowed_mime_types = array['image/png', 'image/webp'];

drop policy if exists header_themes_obj_read on storage.objects;
create policy header_themes_obj_read on storage.objects
  for select to authenticated using (bucket_id = 'header-themes');

drop policy if exists header_themes_obj_insert on storage.objects;
create policy header_themes_obj_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'header-themes'
    and name ~ '^tema-[0-9]{10,16}-(m|d)\.(png|webp)$'
    and public.is_super_admin()
  );

drop policy if exists header_themes_obj_update on storage.objects;
create policy header_themes_obj_update on storage.objects
  for update to authenticated
  using (bucket_id = 'header-themes' and public.is_super_admin())
  with check (
    bucket_id = 'header-themes'
    and name ~ '^tema-[0-9]{10,16}-(m|d)\.(png|webp)$'
    and public.is_super_admin()
  );

drop policy if exists header_themes_obj_delete on storage.objects;
create policy header_themes_obj_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'header-themes' and public.is_super_admin());
