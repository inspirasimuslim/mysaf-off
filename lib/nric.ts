/**
 * Umur (tahun penuh) daripada 6 digit pertama NRIC (YYMMDD).
 *
 * Tarikh lahir tidak disimpan sebagai kolum — ia diterbitkan daripada NRIC,
 * dengan peraturan abad yang SAMA seperti `birthday_today()` (SQL): YY lebih
 * besar daripada dua digit tahun semasa → 19YY, selain itu → 20YY.
 *
 * Memulangkan `null` bila NRIC kosong, bukan 12 digit atau tarikhnya mustahil,
 * supaya pemanggil boleh memilih untuk tidak memaparkan apa-apa.
 */
export function ageFromNric(nric: string | null, today: Date = new Date()): number | null {
  const digits = (nric ?? '').replace(/\D/g, '');
  if (!/^\d{12}$/.test(digits)) return null;

  const yy = Number(digits.slice(0, 2));
  const month = Number(digits.slice(2, 4));
  const day = Number(digits.slice(4, 6));

  const year = yy > today.getFullYear() % 100 ? 1900 + yy : 2000 + yy;
  const born = new Date(year, month - 1, day);
  if (born.getFullYear() !== year || born.getMonth() !== month - 1 || born.getDate() !== day) return null;

  let age = today.getFullYear() - year;
  const hadBirthday =
    today.getMonth() > born.getMonth() || (today.getMonth() === born.getMonth() && today.getDate() >= born.getDate());
  if (!hadBirthday) age -= 1;
  return age >= 0 ? age : null;
}
