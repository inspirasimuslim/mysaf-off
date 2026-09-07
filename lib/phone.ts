/**
 * Nombor Malaysia untuk pautan wa.me: buang ruang, sempang dan tanda tambah,
 * kemudian tukar '0' di hadapan kepada kod negara '60'.
 *
 * Memulangkan `null` bila tiada digit yang tinggal, supaya pemanggil boleh
 * meninggalkan butang WhatsApp daripada memaparkan pautan yang pasti gagal.
 *
 * Tinggal di `lib/` dan bukan di dalam skrin yang mula-mula memerlukannya:
 * skrin log masuk juga memautkan nombor Super Admin, dan sebuah skrin dalam
 * `app/` bukan tempat untuk skrin lain mengimport daripadanya.
 */
export function toWhatsAppNumber(raw: string | null): string | null {
  if (!raw) return null;

  const digits = raw.replace(/[^\d]/g, '');
  if (!digits) return null;

  if (digits.startsWith('60')) return digits;
  if (digits.startsWith('0')) return '60' + digits.slice(1);
  return digits;
}
