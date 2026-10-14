-- =============================================================================
-- Pemadaman akaun: ciri baharu (kaunseling, infaq Tabung Zakat) tidak lagi menyekat
-- pemadaman ahli (2026-10-14 / 15, migration 159, BELUM di-push ke produksi).
--
-- Masalah: `counselors.member_id` (153) dan `zakat_infaq.member_id` (154) ialah
-- `on delete restrict`, jadi `admin-delete-member` (padam keras baris `members`)
-- GAGAL untuk ahli yang pernah jadi kaunselor atau pernah berinfaq — bercanggah
-- dengan Dasar Privasi ("dipadam atau dianonimkan").
--
-- Penyelesaian (tiada data sedia ada diubah; hanya longgar FK + tulis semula 4 fungsi):
--   * `zakat_infaq.member_id` nullable, `on delete set null` — rekod kewangan kekal
--     untuk audit tanpa identiti (corak yang dinyatakan dalam dasar).
--   * `counselors.member_id` nullable, `on delete set null` — baris kaunselor kekal
--     sebagai cangkerang tak aktif supaya sejarah perbualan AHLI LAIN tidak hilang;
--     trigger menanda tak aktif sebelum ahli dipadam.
--   * Fungsi yang `join` ke `members` melalui kaunselor/infaq ditulis semula dengan
--     `left join` + nama ganti, supaya baris tidak lenyap senyap.
--   * Perbualan kaunseling/maklum balas, permohonan bantuan (+ sejarah, nota) dan
--     counseling_contacts sudah `on delete cascade` dari `members` — tiada perubahan.
--   * Fail QR DuitNow dalam Storage `bantuan-qr` dibuang oleh Edge Function
--     `admin-delete-member` (tiada FK ke Storage).
-- =============================================================================

-- ---- zakat_infaq ------------------------------------------------------------
alter table public.zakat_infaq alter column member_id drop not null;
alter table public.zakat_infaq drop constraint if exists zakat_infaq_member_id_fkey;
alter table public.zakat_infaq
  add constraint zakat_infaq_member_id_fkey
  foreign key (member_id) references public.members (id) on delete set null;

-- ---- counselors -------------------------------------------------------------
alter table public.counselors alter column member_id drop not null;
alter table public.counselors drop constraint if exists counselors_member_id_fkey;
alter table public.counselors
  add constraint counselors_member_id_fkey
  foreign key (member_id) references public.members (id) on delete set null;

-- Kaunselor yang ahlinya dipadam: tak aktif (tiada akses perbualan), tarikh dicatat.
create or replace function public.members_deactivate_counselor_on_delete()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  update public.counselors
     set aktif = false, removed_at = coalesce(removed_at, now())
   where member_id = old.id;
  return old;
end;
$$;

drop trigger if exists members_deactivate_counselor_on_delete on public.members;
create trigger members_deactivate_counselor_on_delete
  before delete on public.members
  for each row execute function public.members_deactivate_counselor_on_delete();

revoke all on function public.members_deactivate_counselor_on_delete() from public, anon, authenticated;

-- ---- Fungsi: left join supaya kaunselor/derma yang dipadam tidak lenyap -------

-- Perbualan ahli sendiri (salinan 153; join kaunselor -> members jadi left join).
create or replace function public.counseling_my_threads()
returns table (id uuid, counselor_name text, counselor_aktif boolean, last_message_at timestamptz,
               last_sender text, last_body text, unread boolean)
language sql stable security definer set search_path = public
as $$
  select t.id, coalesce(m.full_name, 'Kaunselor (akaun dipadam)'), c.aktif, t.last_message_at, t.last_sender,
         (select x.body from public.counseling_messages x where x.thread_id = t.id order by x.created_at desc limit 1),
         (t.last_sender = 'kaunselor' and (t.member_read_at is null or t.member_read_at < t.last_message_at))
  from public.counseling_threads t
  join public.counselors c on c.id = t.counselor_id
  left join public.members m on m.id = c.member_id
  where public.my_member_id() is not null and t.member_id = public.my_member_id()
  order by t.last_message_at desc
  limit 100;
$$;

-- Kepala perbualan (salinan 153; kaunselor -> members jadi left join).
create or replace function public.counseling_thread_info(p_thread uuid)
returns table (counterpart_name text, counterpart_generasi text, is_member boolean, can_reply boolean)
language plpgsql stable security definer set search_path = public
as $$
declare
  v_member uuid := public.my_member_id();
  t public.counseling_threads%rowtype;
  v_is_member boolean;
  v_is_counselor boolean;
begin
  select * into t from public.counseling_threads where id = p_thread;
  if not found then
    raise exception 'Perbualan tidak dijumpai.' using errcode = 'P0002';
  end if;
  v_is_member := v_member is not null and t.member_id = v_member;
  v_is_counselor := coalesce(public.my_counselor_id() = t.counselor_id, false);
  if not v_is_member and not v_is_counselor then
    raise exception 'Anda tidak boleh melihat perbualan ini.' using errcode = '42501';
  end if;
  if v_is_member then
    return query
      select coalesce(m.full_name, 'Kaunselor (akaun dipadam)'), m.generasi, true,
             exists (select 1 from public.counselors c2 where c2.id = t.counselor_id and c2.aktif)
      from public.counselors c left join public.members m on m.id = c.member_id where c.id = t.counselor_id;
  else
    return query select m.full_name, m.generasi, false, true from public.members m where m.id = t.member_id;
  end if;
end;
$$;

-- Senarai kaunselor untuk LK (salinan 153; left join + nama ganti).
create or replace function public.counseling_admin_list()
returns table (id uuid, full_name text, generasi text, aktif boolean, appointed_at timestamptz,
               removed_at timestamptz, ahli_menghubungi integer)
language sql stable security definer set search_path = public
as $$
  select c.id, coalesce(m.full_name, 'Ahli dipadam'), m.generasi, c.aktif, c.appointed_at, c.removed_at,
         (select count(distinct x.member_id)::integer from public.counseling_contacts x where x.counselor_id = c.id)
  from public.counselors c
  left join public.members m on m.id = c.member_id
  where public.has_department_access('LAJNAH KEBAJIKAN', false)
  order by c.aktif desc, coalesce(m.full_name, 'Ahli dipadam');
$$;

-- Infaq admin (salinan 154; left join + penderma tanpa identiti dikira berasingan).
create or replace function public.zakat_infaq_admin_list()
returns table (id uuid, created_at timestamptz, nombor_ahli text, full_name text, generasi text,
               amount numeric, requested_amount numeric, status text, note text, gateway_reference text)
language sql stable security definer set search_path = public
as $$
  select z.id, z.created_at, m.nombor_ahli::text, coalesce(m.full_name, 'Ahli dipadam'), m.generasi,
         z.amount, z.requested_amount, z.status, z.note, z.gateway_reference
  from public.zakat_infaq z
  left join public.members m on m.id = z.member_id
  where public.can_view_bantuan_admin()
  order by z.created_at desc, z.id;
$$;

create or replace function public.zakat_infaq_admin_summary()
returns table (jumlah numeric, bilangan integer, penderma integer, belum_selesai integer)
language sql stable security definer set search_path = public
as $$
  select coalesce(sum(z.amount) filter (where z.status = 'success'), 0),
         (count(*) filter (where z.status = 'success'))::integer,
         (count(distinct coalesce(z.member_id, z.id)) filter (where z.status = 'success'))::integer,
         (count(*) filter (where z.status = 'pending'))::integer
  from public.zakat_infaq z
  where public.can_view_bantuan_admin();
$$;

notify pgrst, 'reload schema';
