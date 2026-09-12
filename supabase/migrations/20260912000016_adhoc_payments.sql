-- =============================================================================
-- mysaf-off — Pembayaran adhoc + persediaan gateway
--
-- Jalankan SELEPAS 20260912000015_pipis.sql. Skrip ini idempotent: selamat
-- dijalankan semula.
--
-- Dua perkara yang tidak berkaitan, dalam satu migration kerana kedua-duanya
-- menjawab soalan yang sama — "bagaimana ahli membayar":
--
--   1. Pembayaran adhoc: infaq, tabung khas, apa sahaja yang bukan yuran dan
--      bukan PIPIS. Bendahari menampal kod QR DuitNow, ahli mengimbasnya.
--   2. Persediaan SKEMA untuk ToyyibPay — tiada kod, tiada UI, tiada panggilan.
--
-- Adhoc TIDAK mempunyai lejar. Ia satu papan notis dan bukan akaun: tiada
-- siapa merekod siapa yang sudah membayar, kerana wang masuk terus ke akaun
-- bank melalui DuitNow dan aplikasi ini tidak pernah melihatnya. Menambah
-- table pembayaran di sini bermakna mencipta senarai yang tiada sesiapa boleh
-- pastikan ketepatannya.
-- =============================================================================


-- =============================================================================
-- 1. TABLE adhoc_payment_types
--
-- Dimiliki oleh BENDAHARI — department yang sama seperti Yuran, kerana ia
-- soalan yang sama: wang masuk organisasi.
--
-- `qr_image_url` boleh NULL, tidak seperti `poster_url` pengumuman. Bendahari
-- selalunya mengumumkan tabung dahulu dan menyediakan kod QR beberapa hari
-- kemudian; memaksanya memilih imej pada saat pertama bermakna tabung itu
-- tidak boleh disiapkan langsung sehingga QR siap.
-- =============================================================================

create table if not exists public.adhoc_payment_types (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  description  text,
  qr_image_url text,

  -- Suis, bukan padam. Tabung bermusim (contoh: korban, ramadan) dihidupkan
  -- semula setiap tahun, dan menyembunyikannya lebih murah daripada mencipta
  -- semula berserta kod QR-nya.
  is_active    boolean not null default true,

  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists adhoc_payment_types_active_idx
  on public.adhoc_payment_types (is_active, created_at desc);

drop trigger if exists adhoc_payment_types_set_updated_at on public.adhoc_payment_types;
create trigger adhoc_payment_types_set_updated_at
  before update on public.adhoc_payment_types
  for each row execute function public.set_updated_at();


-- =============================================================================
-- 2. RLS adhoc_payment_types
--
-- Bentuk yang sama seperti `announcements`: bacaan terbuka kepada setiap ahli
-- yang log masuk (itulah gunanya senarai ini), tulisan milik satu department.
--
-- `can_edit_yuran()` sudah merangkumi laluan Super Admin dan semakan sekatan
-- akaun melalui `has_department_access()`, jadi tiada cabang berasingan
-- diperlukan untuk kedua-duanya.
-- =============================================================================

alter table public.adhoc_payment_types enable row level security;

drop policy if exists adhoc_payment_types_select on public.adhoc_payment_types;
create policy adhoc_payment_types_select on public.adhoc_payment_types
  for select to authenticated
  using (
    -- Bendahari melihat yang tidak aktif juga; itu yang menjadikan senarai
    -- pentadbiran berguna.
    public.can_view_yuran()
    or (is_active and not public.my_account_suspended())
  );

drop policy if exists adhoc_payment_types_insert on public.adhoc_payment_types;
create policy adhoc_payment_types_insert on public.adhoc_payment_types
  for insert to authenticated
  with check (public.can_edit_yuran());

drop policy if exists adhoc_payment_types_update on public.adhoc_payment_types;
create policy adhoc_payment_types_update on public.adhoc_payment_types
  for update to authenticated
  using (public.can_edit_yuran())
  with check (public.can_edit_yuran());

drop policy if exists adhoc_payment_types_delete on public.adhoc_payment_types;
create policy adhoc_payment_types_delete on public.adhoc_payment_types
  for delete to authenticated
  using (public.can_edit_yuran());

grant select, insert, update, delete on public.adhoc_payment_types to authenticated;


-- =============================================================================
-- 3. BUCKET payment-qr
--
-- `public = true` atas sebab yang sama seperti `announcement-posters`: kod QR
-- dibenamkan terus dalam skrin maklumat pembayaran, jadi ia perlu boleh
-- dicapai tanpa token bertandatangan. Yang dilindungi ialah TULISAN.
--
-- Kod QR DuitNow memang dimaksudkan untuk diedarkan — ia arahan membayar
-- KEPADA organisasi, bukan rahsia. Yang berbahaya ialah sesiapa boleh
-- MENGGANTIKANNYA dengan QR akaun sendiri, dan itulah yang policy tulisan ini
-- halang.
-- =============================================================================

insert into storage.buckets (id, name, public)
values ('payment-qr', 'payment-qr', true)
on conflict (id) do update set public = true;

drop policy if exists payment_qr_public_read on storage.objects;
create policy payment_qr_public_read on storage.objects
  for select
  using (bucket_id = 'payment-qr');

drop policy if exists payment_qr_insert on storage.objects;
create policy payment_qr_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'payment-qr' and public.can_edit_yuran());

drop policy if exists payment_qr_update on storage.objects;
create policy payment_qr_update on storage.objects
  for update to authenticated
  using (bucket_id = 'payment-qr' and public.can_edit_yuran())
  with check (bucket_id = 'payment-qr' and public.can_edit_yuran());

drop policy if exists payment_qr_delete on storage.objects;
create policy payment_qr_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'payment-qr' and public.can_edit_yuran());


-- =============================================================================
-- 4. PERSEDIAAN GATEWAY — SKEMA SAHAJA
--
-- Method 'gateway' dan kolum gateway_reference disediakan untuk integrasi
-- ToyyibPay akan datang. Edge Function create-toyyibpay-bill dan
-- toyyibpay-webhook akan ditambah bila kredential merchant (Category Code,
-- Secret Key) diperoleh.
--
-- Skema didahulukan daripada kod DENGAN SENGAJA. Bila kredential sampai, yang
-- perlu ditulis hanyalah dua Edge Function yang memasukkan baris ke table yang
-- sudah wujud — tiada migration yang menyentuh 269 rekod sumbangan dan 984
-- baris yuran yang sudah ada di dalamnya.
--
-- `gateway_reference` ialah kolum dan bukan JSON dalam `note`: ia akan dicari
-- ("baris mana yang datang dari bil ToyyibPay ini?") apabila webhook tiba dua
-- kali untuk pembayaran yang sama, dan carian dalam teks bebas bukan sesuatu
-- yang patut dibina sekarang untuk dibaiki kemudian.
--
-- Perubahan ini ADITIF sepenuhnya: nilai method sedia ada kekal sah, kolum
-- baharu nullable, dan tiada baris disentuh.
-- =============================================================================

alter table public.yuran_payments
  add column if not exists gateway_reference text;

alter table public.pipis_contributions
  add column if not exists gateway_reference text;

/*
  CHECK digugurkan dan dicipta semula, bukan diubah — Postgres tiada
  `alter constraint` bagi ungkapan CHECK. Nama yang sama dikekalkan supaya
  larian kedua skrip ini menggantikan kekangan yang betul dan bukan menambah
  kekangan kedua di sebelahnya.
*/
alter table public.yuran_payments drop constraint if exists yuran_payments_method_check;
alter table public.yuran_payments add constraint yuran_payments_method_check
  check (method in ('import_opening', 'import', 'manual_adjustment', 'gateway'));

alter table public.pipis_contributions drop constraint if exists pipis_contributions_method_check;
alter table public.pipis_contributions add constraint pipis_contributions_method_check
  check (method in ('import', 'manual_adjustment', 'gateway'));

/*
  Index separa: baris gateway ialah minoriti kecil (sifar buat masa ini), dan
  satu-satunya soalan yang akan ditanya terhadapnya ialah pencarian rujukan
  ketika webhook masuk.
*/
create index if not exists yuran_payments_gateway_ref_idx
  on public.yuran_payments (gateway_reference)
  where gateway_reference is not null;

create index if not exists pipis_contributions_gateway_ref_idx
  on public.pipis_contributions (gateway_reference)
  where gateway_reference is not null;

notify pgrst, 'reload schema';
