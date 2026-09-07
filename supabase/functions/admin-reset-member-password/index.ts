import {
  CORS_HEADERS,
  RequestError,
  TEMP_PASSWORD,
  adminClient,
  json,
  readJson,
  requireSuperAdmin,
  tempPasswordExpiry,
  text,
} from '../_shared/admin.ts';

/**
 * Tetapkan semula kata laluan seorang ahli kepada kata laluan sementara.
 *
 * Menggantikan laluan lama yang hanya membuka semula TEMPOH: menetapkan
 * `must_change_password` tanpa menyentuh kata laluan hanya membantu ahli yang
 * masih ingat kata laluannya. Orang yang meminta bantuan admin biasanya
 * meminta kerana dia TIDAK ingat, jadi bendera sahaja bukan jawapan.
 *
 * `service_role` diperlukan kerana menukar kata laluan orang lain ialah operasi
 * Admin API, dan kunci itu hanya wujud dalam persekitaran Edge Function.
 */

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  try {
    if (request.method !== 'POST') throw new RequestError('Kaedah tidak dibenarkan.', 405);

    await requireSuperAdmin(request);

    const body = await readJson(request);
    const memberId = text(body.member_id);
    if (!memberId) throw new RequestError('Rekod ahli diperlukan.');

    const admin = adminClient();

    const { data: member, error: readError } = await admin
      .from('members')
      .select('id, full_name, email, user_id')
      .eq('id', memberId)
      .maybeSingle();

    if (readError) throw new RequestError('Gagal membaca rekod ahli: ' + readError.message, 500);
    if (!member) throw new RequestError('Rekod ahli tidak dijumpai.', 404);

    if (!member.user_id) {
      throw new RequestError(
        'Ahli ini belum mempunyai akaun log masuk. Gunakan Provision Akaun Ahli terlebih dahulu.',
        409,
      );
    }

    /*
      Kata laluan DAHULU, bendera KEMUDIAN, dan urutan itu penting.

      Terbalik, kegagalan menukar kata laluan akan meninggalkan ahli yang
      ditandakan "mesti tukar" sedangkan kata laluannya tidak berubah — dia
      dipaksa ke skrin tukar kata laluan tanpa cara untuk log masuk ke situ.
    */
    const { error: passwordError } = await admin.auth.admin.updateUserById(member.user_id, {
      password: TEMP_PASSWORD,
    });

    if (passwordError) {
      throw new RequestError('Gagal menetapkan semula kata laluan: ' + passwordError.message, 500);
    }

    const expiresAt = tempPasswordExpiry();

    const { error: flagError } = await admin
      .from('members')
      .update({ must_change_password: true, temp_password_expires_at: expiresAt })
      .eq('id', memberId);

    /*
      Kata laluan sudah bertukar tetapi bendera tidak. Keadaan ini TIDAK dibiarkan
      senyap: ahli boleh log masuk dengan kata laluan sementara dan app tidak akan
      memaksanya menukarnya, yang bermakna kata laluan yang diketahui umum kekal
      selama-lamanya. Admin diberitahu dengan tepat apa yang berlaku dan apa yang
      perlu dibuat.
    */
    if (flagError) {
      return json(
        {
          error:
            'Kata laluan sudah ditetapkan semula kepada kata laluan sementara, TETAPI penandaan "mesti tukar kata laluan" GAGAL (' +
            flagError.message +
            '). Ahli ini boleh log masuk tetapi tidak akan dipaksa menukarnya. Sila cuba butang ini sekali lagi.',
        },
        500,
      );
    }

    return json({
      member_id: member.id,
      full_name: member.full_name,
      email: member.email,
      // Nilainya bukan rahsia — ia dicetak pada skrin admin supaya dia boleh
      // menyampaikannya, dan ia sama untuk setiap ahli.
      password: TEMP_PASSWORD,
      expires_at: expiresAt,
    });
  } catch (caught) {
    if (caught instanceof RequestError) return json({ error: caught.message }, caught.status);
    return json({ error: 'Ralat tidak dijangka pada pelayan.' }, 500);
  }
});
