-- =============================================================================
-- mysaf-off — Segerakkan `bil_anak` + `tahun_berkahwin` antara pasangan MBM
--
-- Punca: kedua-dua medan ialah medan PER-AHLI; tiada apa yang menyegerakkannya
-- antara dua ahli yang dipautkan MBM. Seorang ahli mengisi 2 anak, pasangannya
-- kekal 3. `list_mbm_couples()` pula memaparkan `coalesce(a, b)` — nilai ahli
-- ber-`id` lebih rendah — jadi senarai Ahli MBM tidak sepadan dengan profil
-- salah seorang daripada mereka.
--
-- Peraturan tunggal (setiap medan diputuskan berasingan):
-- SIAPA KEMAS KINI TERAKHIR, DIA MENANG.
--   1. Bila medan diubah pada ahli yang berpasangan (pautan DUA HALA),
--      pasangan dikemas kini kepada nilai yang sama (trigger AFTER UPDATE).
--      Hanya medan yang BERUBAH dihantar — medan lain pasangan tidak disentuh.
--   2. Bila pautan MBM baharu ditetapkan (`spouse_member_id`):
--        - medan diubah dalam simpanan yang sama -> nilai itu menang;
--        - salah satu kosong (null / teks kosong) -> yang terisi menang;
--        - kedua-dua terisi dan berbeza -> yang `self_updated_at` LEBIH BARU
--          menang (kosong = paling lama); jika sama, nilai yang LEBIH BESAR
--          (bilangan anak jarang berkurang; tahun yang lebih besar = lebih
--          terkini — yang kecil lebih mungkin lapuk).
--   3. Pembaikan data sedia ada (bahagian 3) guna peraturan yang SAMA.
--
-- `update` ke atas baris pasangan dibuat oleh fungsi security definer, jadi
-- RLS ("hanya baris sendiri") tidak menghalang. `members_track_self_update`
-- membiarkan `self_updated_at` pasangan tidak berubah kerana `auth.uid()` bukan
-- pemilik baris itu — pasangan tidak dilabel "baru kemas kini profil".
--
-- Snapshot rollback: backup_20260929.members_pasangan_pre_sync
-- =============================================================================


-- =============================================================================
-- 1. Pemilih nilai — digunakan trigger DAN pembaikan data
-- =============================================================================

create or replace function public.pick_bil_anak(
  a_val int, a_ts timestamptz,
  b_val int, b_ts timestamptz
)
returns int
language sql
immutable
as $$
  select case
    when a_val is null then b_val
    when b_val is null then a_val
    when a_val = b_val then a_val
    when coalesce(a_ts, '-infinity'::timestamptz) > coalesce(b_ts, '-infinity'::timestamptz) then a_val
    when coalesce(b_ts, '-infinity'::timestamptz) > coalesce(a_ts, '-infinity'::timestamptz) then b_val
    else greatest(a_val, b_val)
  end;
$$;

-- Teks kosong/ruang sahaja dianggap kosong (sama seperti `list_mbm_couples()`).
create or replace function public.pick_tahun_berkahwin(
  a_val text, a_ts timestamptz,
  b_val text, b_ts timestamptz
)
returns text
language sql
immutable
as $$
  select case
    when nullif(btrim(a_val), '') is null then b_val
    when nullif(btrim(b_val), '') is null then a_val
    when btrim(a_val) = btrim(b_val) then a_val
    when coalesce(a_ts, '-infinity'::timestamptz) > coalesce(b_ts, '-infinity'::timestamptz) then a_val
    when coalesce(b_ts, '-infinity'::timestamptz) > coalesce(a_ts, '-infinity'::timestamptz) then b_val
    else greatest(a_val, b_val)
  end;
$$;


-- =============================================================================
-- 2. Trigger
-- =============================================================================

-- 2a. Pautan baharu: extend `sync_spouse_link()` (salinan 049 + langkah sync).
create or replace function public.sync_spouse_link()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_p_anak  int;
  v_p_tahun text;
  v_p_ts    timestamptz;
  v_anak    int;
  v_tahun   text;
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  -- Nyahpaut pasangan LAMA, jika ia masih menunjuk ke baris ini.
  if old.spouse_member_id is not null then
    update public.members
       set spouse_member_id = null
     where id = old.spouse_member_id
       and spouse_member_id = old.id;
  end if;

  if new.spouse_member_id is not null then
    -- Pasangan BAHARU mungkin sudah terpaut kepada orang lain — putuskan
    -- pautan itu dahulu supaya setiap ahli hanya mempunyai SATU pasangan.
    update public.members
       set spouse_member_id = null
     where id in (select m.spouse_member_id from public.members m where m.id = new.spouse_member_id)
       and id <> new.id;

    update public.members
       set spouse_member_id = new.id
     where id = new.spouse_member_id
       and spouse_member_id is distinct from new.id;

    -- Samakan bil_anak + tahun_berkahwin kedua-dua pihak (peraturan di kepala fail).
    select m.bil_anak, m.tahun_berkahwin, m.self_updated_at
      into v_p_anak, v_p_tahun, v_p_ts
      from public.members m
     where m.id = new.spouse_member_id;

    if new.bil_anak is distinct from old.bil_anak and new.bil_anak is not null then
      v_anak := new.bil_anak;                            -- diubah dalam simpanan ini
    else
      v_anak := public.pick_bil_anak(new.bil_anak, old.self_updated_at, v_p_anak, v_p_ts);
    end if;

    if new.tahun_berkahwin is distinct from old.tahun_berkahwin and nullif(btrim(new.tahun_berkahwin), '') is not null then
      v_tahun := new.tahun_berkahwin;
    else
      v_tahun := public.pick_tahun_berkahwin(new.tahun_berkahwin, old.self_updated_at, v_p_tahun, v_p_ts);
    end if;

    new.bil_anak := v_anak;
    new.tahun_berkahwin := v_tahun;

    update public.members
       set bil_anak = v_anak,
           tahun_berkahwin = v_tahun
     where id = new.spouse_member_id
       and (bil_anak is distinct from v_anak or tahun_berkahwin is distinct from v_tahun);
  end if;

  return new;
end;
$$;

-- 2b. Pengubahan seterusnya: medan berubah pada ahli yang sudah berpasangan.
create or replace function public.sync_spouse_shared_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Kemas kini bersarang (kesan trigger ini/2a sendiri) tidak perlu diproses lagi.
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  update public.members
     set bil_anak = case when new.bil_anak is distinct from old.bil_anak then new.bil_anak else bil_anak end,
         tahun_berkahwin = case when new.tahun_berkahwin is distinct from old.tahun_berkahwin
                                then new.tahun_berkahwin else tahun_berkahwin end
   where id = new.spouse_member_id
     and spouse_member_id = new.id                       -- pautan DUA HALA sahaja
     and ((new.bil_anak is distinct from old.bil_anak and bil_anak is distinct from new.bil_anak)
       or (new.tahun_berkahwin is distinct from old.tahun_berkahwin
           and tahun_berkahwin is distinct from new.tahun_berkahwin));

  return new;
end;
$$;

drop trigger if exists members_sync_spouse_shared_fields on public.members;
create trigger members_sync_spouse_shared_fields
  after update on public.members
  for each row
  when ((new.bil_anak is distinct from old.bil_anak or new.tahun_berkahwin is distinct from old.tahun_berkahwin)
        and new.spouse_member_id is not null)
  execute function public.sync_spouse_shared_fields();


-- =============================================================================
-- 3. Pembaikan data sedia ada — snapshot dahulu, kemudian samakan
--
-- Hanya pasangan berpaut DUA HALA yang salah satu medannya berbeza (sama
-- syarat dengan senarai Ahli MBM). Pautan sehala tidak disentuh.
-- =============================================================================

create table backup_20260929.members_pasangan_pre_sync as
select a.id as id_a, a.nombor_ahli as nombor_a, a.bil_anak as bil_anak_a,
       a.tahun_berkahwin as tahun_a, a.self_updated_at as self_updated_a,
       b.id as id_b, b.nombor_ahli as nombor_b, b.bil_anak as bil_anak_b,
       b.tahun_berkahwin as tahun_b, b.self_updated_at as self_updated_b
from public.members a
join public.members b on b.id = a.spouse_member_id and a.id = b.spouse_member_id
where a.id < b.id
  and (a.bil_anak is distinct from b.bil_anak
       or nullif(btrim(a.tahun_berkahwin), '') is distinct from nullif(btrim(b.tahun_berkahwin), ''));

comment on table backup_20260929.members_pasangan_pre_sync is
  'Pasangan MBM dengan bil_anak/tahun_berkahwin berbeza sebelum migration 098. Rollback: kemas kini members.bil_anak/tahun_berkahwin semula daripada lajur _a/_b.';

do $$
declare
  r record;
  v_anak  int;
  v_tahun text;
  n int := 0;
begin
  for r in select * from backup_20260929.members_pasangan_pre_sync loop
    v_anak  := public.pick_bil_anak(r.bil_anak_a, r.self_updated_a, r.bil_anak_b, r.self_updated_b);
    v_tahun := public.pick_tahun_berkahwin(r.tahun_a, r.self_updated_a, r.tahun_b, r.self_updated_b);
    update public.members set bil_anak = v_anak, tahun_berkahwin = v_tahun
     where id in (r.id_a, r.id_b)
       and (bil_anak is distinct from v_anak or tahun_berkahwin is distinct from v_tahun);
    n := n + 1;
  end loop;
  raise notice 'Pembaikan pasangan MBM: % pasangan diselaraskan (bil_anak/tahun_berkahwin).', n;
end $$;

notify pgrst, 'reload schema';
