-- mysaf-off -- Carta Organisasi: bahagian "Usrah Tarbiah" dipecah ikut kawasan usrah.
--
-- Sebelum ini semua naqib kumpulan usrah berada dalam SATU bahagian
-- 'Usrah Tarbiah' (disusun kawasan/kumpulan tetapi tanpa tajuk kawasan).
-- Kini setiap kawasan jadi bahagian sendiri, cth:
--   'Usrah Tarbiah -- Usrah Lembah Klang (ULK)'
-- Skrin Organisasi mengumpul baris ikut `bahagian`, jadi TIADA perubahan
-- app (tiada APK baharu diperlukan). Akhiran kurungan pada bahagian dibuang
-- oleh format jawatan profil/direktori, jadi profil naqib tetap ringkas.
--
-- Hanya `list_org_chart()` diubah (create or replace, bentuk output sama).
-- Susunan: kawasan ikut urutan senarai kawasan app, kemudian nombor kumpulan
-- (Kumpulan 2 sebelum Kumpulan 10), kemudian nama naqib. Bahagian
-- perkaderan sekolah dan org_positions kekal tidak berubah.

create or replace function public.list_org_chart()
returns table (
  id            uuid,
  bahagian      text,
  jawatan       text,
  display_order integer,
  member_id     uuid,
  full_name     text,
  generasi      text,
  avatar_url    text
)
language sql
stable
security definer
set search_path = public
as $$
  with rows as (
    select
      p.id, p.bahagian, p.jawatan, p.display_order, p.member_id,
      m.full_name, m.generasi, m.avatar_url
    from public.org_positions p
    left join public.members m on m.id = p.member_id

    union all

    select
      kn.id,
      ('Usrah Tarbiah — ' || case ku.kawasan_usrah
          when 'US'    then 'Usrah Selatan (US)'
          when 'ULK'   then 'Usrah Lembah Klang (ULK)'
          when 'UU'    then 'Usrah Utara (UU)'
          when 'UPT'   then 'Usrah Pantai Timur (UPT)'
          when 'UT'    then 'Usrah Terengganu (UT)'
          when 'UTS'   then 'Usrah Tengah Semenanjung (UTS)'
          when 'UA-UB' then 'Usrah Antarabangsa & Borneo (UA-UB)'
          when 'UP'    then 'Usrah Perak (UP)'
          else ku.kawasan_usrah
        end)::text as bahagian,
      ('Naqib Kumpulan Usrah — ' || ku.nama)::text as jawatan,
      (1000000 + row_number() over (
        order by
          array_position(array['US','ULK','UU','UPT','UT','UTS','UA-UB','UP'], ku.kawasan_usrah) nulls last,
          ku.kawasan_usrah,
          nullif(regexp_replace(ku.nama, '\D', '', 'g'), '')::int nulls last,
          ku.nama,
          m.full_name
      ))::integer as display_order,
      kn.member_id,
      m.full_name, m.generasi, m.avatar_url
    from public.kumpulan_usrah_naqib kn
    join public.kumpulan_usrah ku on ku.id = kn.kumpulan_id
    join public.members m on m.id = kn.member_id

    union all

    select
      pa.id,
      'Usrah Perkaderan Sekolah'::text as bahagian,
      (case when m.jantina = 'Muslimat' then 'Naqibah Usrah Perkaderan Sekolah' else 'Naqib Usrah Perkaderan Sekolah' end)::text as jawatan,
      (2000000 + row_number() over (order by m.full_name))::integer as display_order,
      pa.member_id,
      m.full_name, m.generasi, m.avatar_url
    from public.perkaderan_naqib_assignments pa
    join public.members m on m.id = pa.member_id
    where pa.is_active
  )
  select * from rows
  where auth.uid() is not null
  order by display_order, id;
$$;

notify pgrst, 'reload schema';
