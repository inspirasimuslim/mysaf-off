import {
  CORS_HEADERS,
  RequestError,
  TEMP_PASSWORD,
  adminClient,
  json,
  requireSuperAdmin,
  tempPasswordExpiry,
} from '../_shared/admin.ts';

/**
 * Cipta akaun log masuk untuk setiap ahli yang belum ada.
 *
 * Rekod ahli datang daripada import Excel dan tidak membawa akaun. Sebelum ini
 * setiap satu perlu dicipta secara individu, yang bermakna ratusan ahli tidak
 * pernah mendapat akaun langsung.
 *
 * Fungsi ini IDEMPOTENT, dan itu bahagian yang paling penting. Ia akan
 * dijalankan berkali-kali — selepas setiap import, selepas kegagalan separa,
 * atau kerana seseorang menekan butang itu dua kali — dan larian kedua tidak
 * boleh mencipta akaun kedua bagi emel yang sama. Sebab itu semakan dibuat
 * terhadap `auth.users`, sumber kebenaran sebenar, dan BUKAN terhadap
 * `members.user_id`: rekod yang akaunnya wujud tetapi pautannya terputus
 * (larian sebelumnya gagal antara dua langkah) mesti dipulihkan pautannya, bukan
 * diberi akaun baharu.
 */

/** Emel dibaca dalam kelompok supaya senarai ratusan ahli tidak menjadi satu permintaan gergasi. */
const PAGE_SIZE = 200;

type Summary = {
  dicipta: number;
  dipaut_semula: number;
  dilangkau_sudah_ada_akaun: number;
  dilangkau_tiada_emel: number;
  gagal: { email: string; sebab: string }[];
};

type PendingMember = { id: string; email: string | null; full_name: string };

/**
 * Peta emel → id akaun bagi SETIAP akaun Auth sedia ada.
 *
 * Dibaca sekali di hadapan dan bukan sekali bagi setiap ahli: pada 325 ahli,
 * menyoal Auth seorang demi seorang bermakna 325 permintaan berturut-turut, dan
 * Edge Function akan tamat masa sebelum separuh selesai.
 */
async function existingAuthUsers(admin: ReturnType<typeof adminClient>): Promise<Map<string, string>> {
  const byEmail = new Map<string, string>();

  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: PAGE_SIZE });
    if (error) throw new RequestError('Gagal membaca senarai akaun: ' + error.message, 500);

    const users = data?.users ?? [];
    for (const user of users) {
      const email = user.email?.trim().toLowerCase();
      if (email) byEmail.set(email, user.id);
    }

    if (users.length < PAGE_SIZE) break;
  }

  return byEmail;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  try {
    if (request.method !== 'POST') throw new RequestError('Kaedah tidak dibenarkan.', 405);

    await requireSuperAdmin(request);

    const admin = adminClient();

    const { data: pending, error: readError } = await admin
      .from('members')
      .select('id, email, full_name')
      .is('user_id', null);

    if (readError) throw new RequestError('Gagal membaca senarai ahli: ' + readError.message, 500);

    const rows = (pending ?? []) as PendingMember[];
    const authByEmail = await existingAuthUsers(admin);

    const summary: Summary = {
      dicipta: 0,
      dipaut_semula: 0,
      dilangkau_sudah_ada_akaun: 0,
      dilangkau_tiada_emel: 0,
      gagal: [],
    };

    /*
      Emel yang muncul dua kali dalam `members` hanya boleh menerima SATU akaun.
      Tanpa set ini, rekod kedua akan cuba mencipta akaun bagi emel yang baru
      sahaja dicipta dalam gelung yang sama dan gagal dengan ralat "sudah wujud"
      yang mengelirukan.
    */
    const handled = new Set<string>();

    for (const row of rows) {
      const email = row.email?.trim().toLowerCase() ?? '';

      if (!email) {
        summary.dilangkau_tiada_emel += 1;
        continue;
      }

      if (handled.has(email)) {
        summary.dilangkau_sudah_ada_akaun += 1;
        continue;
      }

      try {
        const existingId = authByEmail.get(email);

        if (existingId) {
          /*
            Akaun sudah wujud tetapi `members.user_id` masih kosong. Pautannya
            dipulihkan dan kata laluan TIDAK disentuh: orang ini mungkin sudah
            log masuk dan menetapkan kata laluannya sendiri, dan menetapkannya
            semula kepada nilai yang diketahui umum akan mengunci dia keluar
            demi masalah yang tidak wujud.
          */
          const { error: linkError } = await admin
            .from('members')
            .update({ user_id: existingId })
            .eq('id', row.id);

          if (linkError) throw new Error(linkError.message);

          summary.dipaut_semula += 1;
          handled.add(email);
          continue;
        }

        const { data: created, error: createError } = await admin.auth.admin.createUser({
          email,
          password: TEMP_PASSWORD,
          email_confirm: true,
          user_metadata: { full_name: row.full_name },
        });

        if (createError || !created.user) {
          throw new Error(createError?.message ?? 'Akaun tidak tercipta.');
        }

        const { error: updateError } = await admin
          .from('members')
          .update({
            user_id: created.user.id,
            must_change_password: true,
            temp_password_expires_at: tempPasswordExpiry(),
          })
          .eq('id', row.id);

        if (updateError) {
          // Akaun tercipta tetapi rekod tidak dipautkan. Akaun itu DIBUANG
          // supaya larian seterusnya bermula dari keadaan yang sama, bukan
          // daripada emel yang terperangkap separuh jalan.
          await admin.auth.admin.deleteUser(created.user.id).catch(() => {});
          throw new Error(updateError.message);
        }

        authByEmail.set(email, created.user.id);
        handled.add(email);
        summary.dicipta += 1;
      } catch (caught) {
        summary.gagal.push({
          email,
          sebab: caught instanceof Error ? caught.message : 'Ralat tidak dijangka.',
        });
      }
    }

    return json(summary);
  } catch (caught) {
    if (caught instanceof RequestError) return json({ error: caught.message }, caught.status);
    return json({ error: 'Ralat tidak dijangka pada pelayan.' }, 500);
  }
});
