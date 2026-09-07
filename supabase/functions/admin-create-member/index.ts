import {
  CORS_HEADERS,
  RequestError,
  TEMP_PASSWORD,
  adminClient,
  json,
  readJson,
  requireMemberEditor,
  tempPasswordExpiry,
  text,
} from '../_shared/admin.ts';

/**
 * Cipta akaun log masuk + rekod ahli dalam satu langkah.
 *
 * `email_confirm: true` menjadikan akaun terus boleh log masuk tanpa menunggu
 * emel pengesahan — admin menyerahkan kata laluan sementara secara terus.
 *
 * Kata laluan itu kini `TEMP_PASSWORD`, sama untuk setiap ahli baharu, dan
 * bukan lagi 16 aksara rawak. Ia masih dipulangkan dalam respons supaya modal
 * yang memaparkannya tidak perlu tahu nilainya sendiri — tetapi ia bukan lagi
 * rahsia, dan yang menjaga akaun ialah `must_change_password` bersama tarikh
 * luputnya.
 */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Berapa kali perlanggaran `nombor_ahli` dicuba semula sebelum menyerah. */
const NUMBER_ATTEMPTS = 5;

/**
 * Nombor ahli seterusnya = yang tertinggi + 1.
 *
 * Nombor sedia ada TIDAK disusun semula: ahli baharu sekadar menyambung di
 * hujung, supaya nombor yang sudah diedarkan kekal milik orang yang sama.
 */
async function nextMemberNumber(admin: ReturnType<typeof adminClient>): Promise<string> {
  const { data, error } = await admin
    .from('members')
    .select('nombor_ahli')
    .not('nombor_ahli', 'is', null)
    .order('nombor_ahli', { ascending: false })
    .limit(1);

  if (error) throw new RequestError('Gagal membaca nombor ahli terakhir.', 500);

  const highest = data?.[0]?.nombor_ahli ?? '0000';
  const parsed = Number.parseInt(String(highest).replace(/\D/g, ''), 10);
  const next = (Number.isFinite(parsed) ? parsed : 0) + 1;
  return String(next).padStart(4, '0');
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  try {
    if (request.method !== 'POST') throw new RequestError('Kaedah tidak dibenarkan.', 405);

    await requireMemberEditor(request);

    const body = await readJson(request);
    const fullName = text(body.full_name);
    const email = text(body.email)?.toLowerCase() ?? null;
    const generasi = text(body.generasi);
    const kawasanUsrah = text(body.kawasan_usrah);

    if (!fullName) throw new RequestError('Nama penuh diperlukan.');
    if (!email) throw new RequestError('Emel diperlukan.');
    if (!EMAIL_PATTERN.test(email)) throw new RequestError('Format emel tidak sah.');
    if (!generasi) throw new RequestError('Generasi diperlukan.');

    const admin = adminClient();

    // Emel yang sudah dimiliki rekod ahli lain akan menghasilkan dua rekod bagi
    // orang yang sama — tolak lebih awal, dengan mesej yang lebih jelas
    // daripada ralat unik daripada Auth.
    const { data: clash } = await admin.from('members').select('nombor_ahli').ilike('email', email).limit(1);
    if (clash && clash.length) {
      throw new RequestError('Emel ini sudah digunakan oleh ahli ' + clash[0].nombor_ahli + '.');
    }

    const password = TEMP_PASSWORD;

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });

    if (createError || !created.user) {
      const message = createError?.message ?? '';
      if (/already|exists|registered/i.test(message)) {
        throw new RequestError('Emel ini sudah mempunyai akaun log masuk.');
      }
      throw new RequestError('Gagal mencipta akaun: ' + message, 500);
    }

    const userId = created.user.id;

    /*
      Dari sini ke bawah, sebarang kegagalan mesti membuang akaun yang baru
      dicipta. Tanpa itu emel tersebut menjadi terperangkap: akaun log masuk
      wujud tetapi tiada rekod ahli, dan percubaan seterusnya akan ditolak
      kerana emel sudah digunakan.
    */
    try {
      let memberId: string | null = null;
      let nomborAhli = '';

      for (let attempt = 0; attempt < NUMBER_ATTEMPTS; attempt += 1) {
        nomborAhli = await nextMemberNumber(admin);

        const { data: inserted, error: insertError } = await admin
          .from('members')
          .insert({
            nombor_ahli: nomborAhli,
            full_name: fullName,
            email,
            generasi,
            kawasan_usrah: kawasanUsrah,
            user_id: userId,
            // Ditetapkan dalam INSERT yang sama dan bukan sebagai kemas kini
            // berasingan: akaun yang tercipta tanpa tanda ini akan memegang
            // kata laluan yang diketahui umum, selama-lamanya.
            must_change_password: true,
            temp_password_expires_at: tempPasswordExpiry(),
          })
          .select('id')
          .single();

        if (!insertError && inserted) {
          memberId = inserted.id;
          break;
        }

        // 23505 = unique_violation: admin lain mengambil nombor itu dahulu.
        if (insertError?.code !== '23505') {
          throw new RequestError('Gagal mencipta rekod ahli: ' + (insertError?.message ?? ''), 500);
        }
      }

      if (!memberId) {
        throw new RequestError('Gagal menetapkan nombor ahli yang unik. Sila cuba lagi.', 409);
      }

      return json({
        member_id: memberId,
        nombor_ahli: nomborAhli,
        email,
        full_name: fullName,
        // Satu-satunya kali kata laluan ini kelihatan.
        password,
      });
    } catch (caught) {
      await admin.auth.admin.deleteUser(userId).catch(() => {});
      throw caught;
    }
  } catch (caught) {
    if (caught instanceof RequestError) return json({ error: caught.message }, caught.status);
    return json({ error: 'Ralat tidak dijangka pada pelayan.' }, 500);
  }
});
