import { ImageUploadError, pickImage, uploadImage } from './image-upload';
import { updateMember } from './members';

/**
 * Pilih dan muat naik avatar ahli.
 *
 * Nama objek ialah '<member_id>.jpg' — terikat pada rekod ahli dan bukan pada
 * akaun, kerana policy storage menentukan hak menulis dengan membaca semula
 * `members` (lihat `20260906000006_avatars_and_usrah.sql`). Satu ahli bermakna
 * satu fail, jadi muat naik baharu menggantikan yang lama dan tiada fail yatim
 * terkumpul.
 *
 * Kerja sebenar membaca dan menghantar bait ada dalam `lib/image-upload.ts`,
 * dikongsi dengan poster program.
 */

const BUCKET = 'avatars';

/** Had piksel; gambar telefon moden jauh lebih besar daripada yang diperlukan. */
const MAX_DIMENSION = 512;

/** Nama sedia ada dikekalkan supaya skrin tidak perlu tahu ia kini dikongsi. */
export { ImageUploadError as AvatarError };

/** `null` bermakna pengguna membatalkan pemilihan — bukan ralat. */
export function pickAvatar(): Promise<string | null> {
  return pickImage([1, 1]);
}

/** Muat naik avatar dan kemas kini `members.avatar_url`. */
export async function uploadAvatar(memberId: string, uri: string): Promise<string> {
  const url = await uploadImage(BUCKET, memberId + '.jpg', uri, MAX_DIMENSION);

  /*
    Melalui `updateMember` dan bukan `.update()` terus: fungsi itu mengesahkan
    baris benar-benar dikemas kini. Muat naik yang failnya tersimpan tetapi
    URLnya tidak pernah mendarat ialah tepat keadaan yang memapar bulatan
    kosong sambil melaporkan kejayaan.
  */
  try {
    await updateMember(memberId, { avatar_url: url });
  } catch (caught) {
    throw new ImageUploadError(caught instanceof Error ? caught.message : 'Gagal menyimpan URL gambar.');
  }

  return url;
}
