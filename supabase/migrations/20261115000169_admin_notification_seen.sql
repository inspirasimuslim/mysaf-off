-- =============================================================================
-- Notifikasi admin: status "dilihat" setiap admin
--
-- Sebelum ini `admin_notifications()` (145) tiada status dibaca — penanda merah
-- hanya hilang bila tugasan selesai, jadi admin yang sudah membuka notifikasi
-- permohonan bantuan/iklan/padam akaun nampaknya lagi (juga selepas log keluar).
--
-- Kini setiap admin menyimpan "dilihat setakat" bagi tiga jenis tugasan tertunggak
-- (iklan_menunggu, padam_akaun, bantuan_menunggu). Satu jenis disembunyikan
-- daripada admin itu selagi `terbaru` <= masa dilihat; bila ada permohonan BAHARU
-- (terbaru lebih baru) ia muncul semula. Disimpan di pangkalan data, bukan pada
-- peranti, jadi kekal selepas log keluar/tukar peranti. Admin lain tidak terjejas.
-- Jenis yang sudah ada status baca sendiri (maklum_balas_chat:*, kaunseling)
-- tidak diubah.
--
-- Tugasan itu sendiri tidak disentuh: skrin semakan masih menunjukkan semua yang
-- menunggu. Hanya penanda/notifikasi yang disenyapkan.
--
-- Pelaksanaan: fungsi lama dinamakan semula `admin_notifications_raw()` (badan
-- tidak berubah, tidak lagi boleh dipanggil klien); `admin_notifications()` baharu
-- membungkusnya dan menapis. Tiada data sedia ada diubah — tiada snapshot.
-- =============================================================================

create table if not exists public.admin_notification_seen (
  user_id uuid not null references auth.users (id) on delete cascade,
  kind    text not null,
  seen_at timestamptz not null default now(),
  primary key (user_id, kind),
  constraint admin_notification_seen_kind check (kind in ('iklan_menunggu', 'padam_akaun', 'bantuan_menunggu'))
);

alter table public.admin_notification_seen enable row level security;
revoke all on public.admin_notification_seen from anon, authenticated;

do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'admin_notifications')
     and not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                     where n.nspname = 'public' and p.proname = 'admin_notifications_raw') then
    alter function public.admin_notifications() rename to admin_notifications_raw;
  end if;
end $$;

revoke all on function public.admin_notifications_raw() from public, anon, authenticated;

create or replace function public.admin_notifications()
returns table (
  kind    text,
  title   text,
  preview text,
  jumlah  integer,
  terbaru timestamptz,
  route   text
)
language sql
stable
security definer
set search_path = public
as $$
  select r.kind, r.title, r.preview, r.jumlah, r.terbaru, r.route
  from public.admin_notifications_raw() r
  where not exists (
    select 1
    from public.admin_notification_seen s
    where s.user_id = auth.uid()
      and s.kind = r.kind
      and r.terbaru is not null
      and s.seen_at >= r.terbaru
  );
$$;

revoke all on function public.admin_notifications() from public, anon;
grant execute on function public.admin_notifications() to authenticated;

create or replace function public.admin_notification_mark_seen(p_kinds text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Perlu log masuk.' using errcode = '28000';
  end if;

  insert into public.admin_notification_seen (user_id, kind, seen_at)
  select auth.uid(), k, now()
  from unnest(p_kinds) as k
  where k in ('iklan_menunggu', 'padam_akaun', 'bantuan_menunggu')
  on conflict (user_id, kind) do update set seen_at = excluded.seen_at;
end;
$$;

revoke all on function public.admin_notification_mark_seen(text[]) from public, anon;
grant execute on function public.admin_notification_mark_seen(text[]) to authenticated;

notify pgrst, 'reload schema';
