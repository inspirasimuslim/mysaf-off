import {
  CORS_HEADERS,
  RequestError,
  adminClient,
  json,
  readJson,
  requireMemberEditor,
  text,
} from '../_shared/admin.ts';

/**
 * Padam rekod ahli DAN akaun log masuknya.
 *
 * Tindakan ini kekal — tiada tong sampah, tiada pemulihan. App bertanggungjawab
 * mengesahkan niat (dialog dua lapis) sebelum memanggil; fungsi ini menganggap
 * pengesahan itu sudah berlaku dan hanya menyemak kebenaran.
 *
 * Urutan padam sengaja: avatar, kemudian rekod ahli, kemudian akaun. Kalau
 * langkah akaun gagal, yang tertinggal hanyalah akaun tanpa rekod — keadaan
 * yang admin masih boleh lihat dan bereskan. Urutan bertentangan akan
 * meninggalkan rekod ahli yang menunjuk kepada akaun yang sudah tiada.
 */

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  try {
    if (request.method !== 'POST') throw new RequestError('Kaedah tidak dibenarkan.', 405);

    const callerId = await requireMemberEditor(request);

    const body = await readJson(request);
    const memberId = text(body.member_id);
    if (!memberId) throw new RequestError('member_id diperlukan.');

    const admin = adminClient();

    const { data: member, error: readError } = await admin
      .from('members')
      .select('id, nombor_ahli, full_name, user_id, avatar_url')
      .eq('id', memberId)
      .maybeSingle();

    if (readError) throw new RequestError('Gagal membaca rekod ahli.', 500);
    if (!member) throw new RequestError('Rekod ahli tidak dijumpai.', 404);

    // Admin yang memadam dirinya sendiri akan kehilangan akaunnya di tengah
    // sesi, meninggalkan app dalam keadaan yang mengelirukan.
    if (member.user_id && member.user_id === callerId) {
      throw new RequestError('Anda tidak boleh memadam rekod anda sendiri.', 409);
    }

    // Fail avatar tidak terikat pada baris melalui foreign key, jadi ia perlu
    // dibuang secara eksplisit atau ia kekal selamanya dalam bucket.
    await admin.storage.from('avatars').remove([memberId + '.jpg', memberId + '.png', memberId + '.jpeg']).catch(
      () => {},
    );

    const { error: deleteMemberError } = await admin.from('members').delete().eq('id', memberId);
    if (deleteMemberError) {
      throw new RequestError('Gagal memadam rekod ahli: ' + deleteMemberError.message, 500);
    }

    let accountDeleted = false;
    if (member.user_id) {
      const { error: deleteUserError } = await admin.auth.admin.deleteUser(member.user_id);
      if (deleteUserError) {
        // Rekod sudah tiada; beritahu dengan tepat apa yang tertinggal supaya
        // admin tidak menyangka semuanya selesai.
        return json(
          {
            member_deleted: true,
            account_deleted: false,
            error:
              'Rekod ahli telah dipadam, tetapi akaun log masuk gagal dipadam: ' +
              deleteUserError.message,
          },
          207,
        );
      }
      accountDeleted = true;
    }

    return json({
      member_deleted: true,
      account_deleted: accountDeleted,
      nombor_ahli: member.nombor_ahli,
      full_name: member.full_name,
    });
  } catch (caught) {
    if (caught instanceof RequestError) return json({ error: caught.message }, caught.status);
    return json({ error: 'Ralat tidak dijangka pada pelayan.' }, 500);
  }
});
