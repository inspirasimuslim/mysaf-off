-- =============================================================================
-- mysaf-off — Eksport ahli: lajur status_pasangan (BELUM di-push)
--
-- `members_full_export()` (drop+create, salinan 093) +1 medan `status_pasangan`:
--   'MBM'       jika `spouse_member_id` terisi (pasangan ahli MBM),
--   'Bukan MBM' jika tiada `spouse_member_id` tetapi teks `nama_pasangan` ada,
--   null        jika tiada pasangan direkod.
-- Sama peraturan dengan borang (MBM vs Bukan MBM ditentukan medan mana terisi).
-- Tiada data diubah, tiada snapshot. Kesihatan tidak termasuk.
-- =============================================================================

drop function if exists public.members_full_export();

create function public.members_full_export()
returns table (
  nombor_ahli             text,
  generasi                text,
  full_name               text,
  nama_panggilan          text,
  jantina                 text,
  nric                    text,
  email                   text,
  no_tel                  text,
  alamat                  text,
  alamat_semasa           text,
  kawasan_usrah           text,
  disekat                 boolean,
  jawatan_ikhwan_1        text,
  jawatan_ikhwan_2        text,
  jawatan_ikhwan_aktif    boolean,
  jawatan_pas_1           text,
  jawatan_pas_2           text,
  no_keahlian_pas         text,
  jawatan_pas_aktif       boolean,
  sekolah                 text,
  status_pekerjaan        text,
  sektor_pekerjaan        text,
  bidang_kerajaan                text,
  bidang_kerajaan_lain_teks      text,
  kumpulan_bidang_swasta         text,
  bidang_khusus_swasta           text,
  bidang_khusus_swasta_lain_teks text,
  jenis_kerja_sendiri            text,
  bidang_kerja_sendiri_lain_teks text,
  bidang_pekerjaan_lama          text,
  jawatan_pekerjaan       text,
  nama_majikan            text,
  negeri_tempat_kerja     text,
  anggaran_pendapatan_range text,
  status_perkahwinan      text,
  nama_pasangan           text,
  status_pasangan         text,
  tahun_berkahwin         text,
  bil_anak                integer,
  sebab_bercerai_kematian text,
  cenderung_baitul_muslim boolean,
  jawatan                 text,
  self_updated_at         timestamptz,
  created_at              timestamptz
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if not coalesce(public.can_view_members(), false) then
    raise exception 'Eksport data ahli memerlukan kebenaran melihat pada JABATAN DATA & SUMBER MANUSIA.'
      using errcode = 'MS001';
  end if;

  return query
  select
    m.nombor_ahli,
    m.generasi,
    m.full_name,
    m.nama_panggilan,
    m.jantina,
    m.nric,
    m.email,
    m.no_tel,
    m.alamat,
    m.alamat_semasa,
    m.kawasan_usrah,
    m.disekat,
    m.jawatan_ikhwan_1,
    m.jawatan_ikhwan_2,
    m.jawatan_ikhwan_aktif,
    m.jawatan_pas_1,
    m.jawatan_pas_2,
    m.no_keahlian_pas,
    m.jawatan_pas_aktif,
    s.nama as sekolah,
    m.status_pekerjaan,
    m.sektor_pekerjaan,
    m.bidang_kerajaan,
    m.bidang_kerajaan_lain_teks,
    m.kumpulan_bidang_swasta,
    m.bidang_khusus_swasta,
    m.bidang_khusus_swasta_lain_teks,
    m.jenis_kerja_sendiri,
    m.bidang_kerja_sendiri_lain_teks,
    m.bidang_pekerjaan_lama,
    m.jawatan_pekerjaan,
    m.nama_majikan,
    m.negeri_tempat_kerja,
    m.anggaran_pendapatan_range,
    m.status_perkahwinan,
    coalesce(sp.full_name, m.nama_pasangan) as nama_pasangan,
    case
      when m.spouse_member_id is not null then 'MBM'
      when nullif(btrim(m.nama_pasangan), '') is not null then 'Bukan MBM'
    end as status_pasangan,
    m.tahun_berkahwin,
    m.bil_anak,
    m.sebab_bercerai_kematian,
    m.cenderung_baitul_muslim,
    j.jawatan,
    m.self_updated_at,
    m.created_at
  from public.members m
  left join public.schools s on s.id = m.sekolah_id
  left join public.members sp on sp.id = m.spouse_member_id
  left join lateral (
    select
      case
        when position(lower(x.bahagian) in lower(x.jawatan)) > 0 then x.jawatan
        else x.jawatan || ' - ' || x.bahagian
      end as jawatan
    from (
      select
        btrim(p.jawatan) as jawatan,
        btrim(regexp_replace(p.bahagian, '\s*\([^)]*\)', '', 'g')) as bahagian,
        p.display_order,
        p.created_at
      from public.org_positions p
      where p.member_id = m.id
    ) x
    order by x.display_order, x.created_at
    limit 1
  ) j on true
  order by m.nombor_ahli nulls last, m.full_name;
end;
$$;

revoke all on function public.members_full_export() from public, anon;
grant execute on function public.members_full_export() to authenticated;

notify pgrst, 'reload schema';
