import {
  CORS_HEADERS,
  RequestError,
  TEMP_PASSWORD,
  adminClient,
  json,
  logAdminActivity,
  requireSuperAdmin,
  tempPasswordExpiry,
} from '../_shared/admin.ts';

/**
 * Tetapkan semula kata laluan SEMUA ahli yang belum berjaya log masuk kali
 * pertama, dalam satu operasi.
 *
 * Syaratnya `user_id is not null and must_change_password` — tiga keadaan
 * berbeza yang berakhir di tempat yang sama:
 *   - tidak pernah cuba log masuk langsung;
 *   - pernah log masuk dengan kata laluan sementara tetapi tetingkapnya tamat
 *     sebelum sempat menukar kata laluan;
 *   - pernah direset oleh admin secara individu tetapi masih belum selesai.
 *
 * Ahli yang SUDAH menetapkan kata laluannya sendiri membawa
 * `must_change_password = false` dan tidak pernah termasuk. Mereka sudah
 * berjaya log masuk kali pertama, dan kata laluan mereka bukan milik admin
 * untuk ditukar.
 *
 * Operasi ini idempoten dari segi kesan: menjalankannya dua kali menetapkan
 * kata laluan yang sama sekali lagi dan memanjangkan tetingkap sekali lagi.
 */

/*
  Kata laluan ditukar satu per satu melalui Admin API — tiada panggilan pukal
  untuk itu. Lapan serentak memendekkan masa dinding bagi ratusan akaun tanpa
  membuka ratusan sambungan sekaligus; secara berurutan, 300 akaun boleh
  menghampiri had masa Edge Function.
*/
const BATCH_SIZE = 8;

type Gagal = { nombor_ahli: string | null; full_name: string; sebab: string };

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  try {
    if (request.method !== 'POST') throw new RequestError('Kaedah tidak dibenarkan.', 405);

    const callerId = await requireSuperAdmin(request);

    const admin = adminClient();

    const { data: members, error: readError } = await admin
      .from('members')
      .select('id, nombor_ahli, full_name, user_id')
      .not('user_id', 'is', null)
      .eq('must_change_password', true)
      .order('nombor_ahli', { ascending: true });

    if (readError) throw new RequestError('Gagal membaca senarai ahli: ' + readError.message, 500);

    const senarai = members ?? [];
    if (senarai.length === 0) {
      return json({
        jumlah_diproses: 0,
        jumlah_gagal: 0,
        senarai_gagal: [],
        password: TEMP_PASSWORD,
        expires_at: null,
      });
    }

    const berjaya: string[] = [];
    const senarai_gagal: Gagal[] = [];

    /*
      SATU kegagalan tidak menghentikan yang lain. Operasi ini menyentuh ratusan
      akaun, dan berhenti di tengah jalan meninggalkan keadaan yang lebih sukar
      difahami daripada senarai kegagalan: sebahagian sudah direset, sebahagian
      belum, dan admin tidak tahu di mana sempadannya.
    */
    for (let i = 0; i < senarai.length; i += BATCH_SIZE) {
      const batch = senarai.slice(i, i + BATCH_SIZE);

      await Promise.all(
        batch.map(async (member) => {
          try {
            const { error } = await admin.auth.admin.updateUserById(member.user_id as string, {
              password: TEMP_PASSWORD,
            });

            if (error) {
              senarai_gagal.push({
                nombor_ahli: member.nombor_ahli,
                full_name: member.full_name,
                sebab: error.message,
              });
              return;
            }

            berjaya.push(member.id);
          } catch (caught) {
            senarai_gagal.push({
              nombor_ahli: member.nombor_ahli,
              full_name: member.full_name,
              sebab: caught instanceof Error ? caught.message : 'Ralat tidak dijangka.',
            });
          }
        }),
      );
    }

    const expiresAt = tempPasswordExpiry();

    /*
      Tetingkap dipanjangkan dalam SATU kemas kini, dan hanya untuk ahli yang
      kata laluannya benar-benar bertukar. Ahli yang gagal mengekalkan tarikh
      tamatnya yang lama — memanjangkan tetingkap bagi kata laluan yang tidak
      berubah hanya membuka semula akaun kepada kata laluan yang sudah tidak
      diketahui sesiapa.

      `must_change_password` ditulis semula walaupun ia sudah `true`: ia
      menjadikan operasi ini membetulkan dirinya sendiri jika bendera itu
      pernah terpesong, dan tidak menelan kos tambahan.
    */
    let peringatan: string | null = null;

    if (berjaya.length > 0) {
      const { error: updateError } = await admin
        .from('members')
        .update({ must_change_password: true, temp_password_expires_at: expiresAt })
        .in('id', berjaya);

      /*
        Kata laluan sudah bertukar tetapi tarikh tamat tidak. Ini TIDAK dibiarkan
        senyap: ahli memegang kata laluan sementara baharu dengan tetingkap lama
        yang mungkin sudah tamat, jadi dia tetap tidak boleh masuk. Admin
        diberitahu dengan tepat supaya dia tahu butang ini perlu ditekan semula.
      */
      if (updateError) {
        peringatan =
          'Kata laluan ' +
          berjaya.length +
          ' akaun sudah ditetapkan semula, TETAPI tempoh 3 hari yang baharu GAGAL disimpan (' +
          updateError.message +
          '). Ahli masih tidak akan dapat log masuk sehingga ini berjaya. Sila tekan butang ini sekali lagi.';
      }
    }

    await logAdminActivity(admin, callerId, 'Reset Pukal Akaun Belum Login', 'members', null, {
      label: berjaya.length + ' direset, ' + senarai_gagal.length + ' gagal',
      diproses: berjaya.length,
      gagal: senarai_gagal.length,
      tempoh_disimpan: peringatan === null,
    });

    return json({
      jumlah_diproses: berjaya.length,
      jumlah_gagal: senarai_gagal.length,
      senarai_gagal,
      // Nilainya bukan rahsia — ia dipapar pada skrin admin supaya dia boleh
      // menyampaikannya, dan ia sama untuk setiap ahli.
      password: TEMP_PASSWORD,
      expires_at: berjaya.length > 0 ? expiresAt : null,
      peringatan,
    });
  } catch (caught) {
    if (caught instanceof RequestError) return json({ error: caught.message }, caught.status);
    return json({ error: 'Ralat tidak dijangka pada pelayan.' }, 500);
  }
});
