-- Import Ahli Diputihkan daripada fail "Pemutihan_Ahli.xlsx" (93 baris:
-- NAMA, GEN, TAHUN DIPECAT), atas arahan eksplisit pemilik sistem (apizsekeru,
-- 2026-10-05): "Ni ahli yang pernah dibuang. Masukkan dalam list hub admin >
-- setiausaha > pemutihan ahli."
--
-- 77 daripada 93 baris diimport (nama + generasi + tahun semua lengkap).
-- 16 baris DIGUGURKAN -- tiada TAHUN DIPECAT dinyatakan dalam fail sumber
-- (lajur kosong, bukan merged cell/forward-fill -- disahkan tiada pola susulan
-- yang boleh diteka; `tahun_dibuang` adalah `not null` dalam skema). Baki 16
-- ini perlu ditambah manual melalui skrin apabila tahun disahkan:
--   Ahmad Fidar Rosli (i06), Mohd Fakhrul Radzi B. Mohd Mawardzi (i06),
--   Aliatul Akhma Bt. Hamid (i09), Nurul Izzati Bt Mohamed Nawi (i14),
--   Hannan Amalina Bt Che Yusuff Zaki (i16), Nur Shamin Shaira Bt Mohd Sukri (i17),
--   Mohd Nur Fatihin B Md Asri (i18), Nik Norasmida Bt. Nik Mohamad Azizi (i19),
--   Nur Emilia Syahirah Bt Aznan (i20), Nurul Izzah Bt Abdul Rahim (i20),
--   Siti Sarah Bt Bt Radzuan (i20), Wan Muhammad Zikry Bin Wan Zayuhisham (i22),
--   Norairin Syariza Bt Mohd Pauzi (i23), Nurul Aini Bt Mat Lazim (i23),
--   Muhammad Aizat Bin Mohd Nurudin (i23), Abdul Zuhier Bin Saufi (i24)
--
-- `ahli_diputihkan` kosong sebelum ini (disahkan) -- import ini CIPTA data
-- baharu, tiada data sedia ada ditimpa.

do $$
declare v_before int;
begin
  select count(*) into v_before from public.ahli_diputihkan;
  if v_before <> 0 then
    raise exception 'Jangkaan ahli_diputihkan kosong sebelum import, dapat % baris', v_before;
  end if;
end $$;

insert into public.ahli_diputihkan (nama, generasi, tahun_dibuang)
values
  ('Hisyam B. Fauzi', 'i01', 2010),
  ('Mohamad Zaki B. Saruji', 'i02', 2010),
  ('Syed Mohd Asyif Bakhiar B. Syed Mahaziz', 'i02', 2010),
  ('Badri B. Hassan', 'i02', 2010),
  ('Nik Ahmad Shahril B. Nik Nabil', 'i02', 2010),
  ('Wan Ahmad Zaki B. Wan Mat Alli', 'i02', 2010),
  ('Mohd Amri B. Ibrahim', 'i03', 2010),
  ('Mohd Firdaus B. Mohamed', 'i03', 2010),
  ('Mohd Hazram B. Fauzi', 'i04', 2010),
  ('Nik Mohamad Faizal B. Nik Ibrahim', 'i04', 2010),
  ('Alfian Nazmi B. Mohd Nor', 'i04', 2010),
  ('Ahmad Syukri B. Yusof', 'i04', 2010),
  ('Mohd Haizul Izani B. Daud', 'i04', 2010),
  ('Mohd Syafiee B. Mohamad Ariffin', 'i05', 2010),
  ('Mohd Azuddin B. Che Yob', 'i07', 2010),
  ('Mohd Faizan B. Mustapha', 'i07', 2010),
  ('Mohd Shafiq B. Jaffarullah', 'i07', 2010),
  ('Mohd Tarmizi B. Mahadi', 'i07', 2010),
  ('Nurul Akma Bt Hassan', 'i10', 2010),
  ('Noralyana Bt Che Lah', 'i12', 2010),
  ('Mohd Arif B Mohd Zain', 'i03', 2012),
  ('Muhammad Hilman B Abd Halim', 'i09', 2012),
  ('Siti Faizah Nasir', 'i14', 2012),
  ('Adilah Bt Mansor', 'i02', 2013),
  ('Munirah Bt Mukhtar', 'i02', 2013),
  ('Zul Izzi B Nordin', 'i03', 2013),
  ('Ahmad Zakee B Abdullah Zawawi', 'i04', 2013),
  ('Mohd Affnan B Azmin', 'i07', 2013),
  ('Mohd Firdaus Bin Mohamed Nawi', 'i08', 2013),
  ('Mohd Anis B Mohd Zin', 'i09', 2013),
  ('Siti Nurnadhirah Bt Shamsuddin', 'i11', 2013),
  ('Amiratul Fatin Bt Ibrahim', 'i11', 2013),
  ('Muhamad Fadhli Bin Ab Rahman', 'i13', 2013),
  ('Wan Mohd Hanif Wan Abdullah', 'i12', 2015),
  ('Mohd Sidik bin Hassan', 'i12', 2015),
  ('Nor Najibah binti Mad Yusof', 'i12', 2015),
  ('Suhaiba bin Razmi', 'i16', 2015),
  ('Mohammad Fikri B. Pakaruddin', 'i09', 2016),
  ('Muhammad Zahid Bin Mohd Zain', 'i12', 2016),
  ('Shaidah Nafisah Bt. Juhari', 'i12', 2016),
  ('Sumayyah Bt. Hamid', 'i12', 2016),
  ('Soffiyyatul Husna Bt. Solehuddin', 'i13', 2016),
  ('Zaliha Binti Noor', 'i15', 2017),
  ('Mohd Faizal Bin Ibrahim', 'i04', 2018),
  ('Mohd Zaidi Bin Mat Zaid', 'i08', 2018),
  ('Nur Hafizah Bt Mohamed Jaafar', 'i02', 2019),
  ('Wan Amir Azri B Abd Rahman', 'i06', 2019),
  ('Affandi B Abd Rahman', 'i07', 2019),
  ('Ahmad Al-Hafiz B Ridzuan', 'i10', 2019),
  ('Muhd Sahal B Mad Rozali', 'i10', 2019),
  ('Muhamad Hafiz Aizam B Wan Hasan', 'i15', 2019),
  ('Hasanah Bt Mat Nasir', 'i19', 2019),
  ('Siti Fatimah Azzahra Bt Mohd Zaki', 'i19', 2019),
  ('Nur Syazana Bt Abdul Kadir', 'i19', 2019),
  ('Muhamad Muhammadi B Abd Ghani', 'i20', 2019),
  ('Abdin Syakirin B Joharudin', 'i21', 2019),
  ('Muhammad Salahuddin B Rudy Djohan', 'i21', 2019),
  ('Muhammad Irfanuddin B Mohamed', 'i22', 2019),
  ('Nurul Jannah Mohamed Nawi', 'i12', 2022),
  ('Ahmad Tajul Arisy Bin Mat Nor', 'i14', 2022),
  ('Wan Athirah Syazwani Binti Wan Mohd Zahidi', 'i18', 2022),
  ('Fatin Nursyazliawati Binti Mohd Rosly', 'i18', 2022),
  ('Anis Aisyah', 'i19', 2022),
  ('Ahmad Rujhan Bin Razlan', 'i19', 2022),
  ('Nur Atikah Binti Ahmad', 'i19', 2022),
  ('Tuan Putri Raidah Tuan Rosedi', 'i20', 2022),
  ('Ayub Bin Abd Azid', 'i21', 2022),
  ('Muhammad Umaier B Mohd Sabri', 'i21', 2022),
  ('Muhammad Darwisy Bin Nor Farain', 'i21', 2022),
  ('Nik Mohamad Adil Bin Nik Abdull Malik', 'i21', 2022),
  ('Muhamad Hafifi Bin Mohamed Rosli', 'i22', 2022),
  ('Nik Nasran Alif Bin Nik Mohd Nasri', 'i22', 2022),
  ('Muhammad Aimaan Bin Mohd Azrahi', 'i23', 2022),
  ('Firdaus Hadzri', 'i23', 2022),
  ('Rubiatul Adawiyah Binti Mohd Zulkepli', 'i23', 2022),
  ('Ahmad Syarbaini', 'i01', 2024),
  ('Firdaus Bin Mohd Yusof', 'i03', 2025);

notify pgrst, 'reload schema';
