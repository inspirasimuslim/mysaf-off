import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

/**
 * Perkakas bersama untuk Edge Function pentadbiran ahli.
 *
 * Kedua-dua fungsi memerlukan `service_role` untuk menyentuh `auth.users`.
 * Kunci itu HANYA wujud di sini, dalam persekitaran Edge Function di pelayan
 * Supabase — ia tidak pernah dihantar ke app. Kerana kunci itu memintas RLS
 * sepenuhnya, setiap permintaan disahkan dahulu terhadap JWT PEMANGGIL, dan
 * tidak pernah mempercayai apa-apa peranan yang dihantar dalam badan mesej.
 */

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

/** Ralat yang mesejnya selamat dipapar kepada admin dalam app. */
export class RequestError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

/** Klien `service_role` — memintas RLS. Jangan sesekali dedahkan kepada klien. */
export function adminClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

/**
 * Sahkan pemanggil ialah admin yang boleh menyunting rekod ahli.
 *
 * Semakan dibuat dengan MEMANGGIL SEMULA pangkalan data sebagai pemanggil
 * (`can_edit_members()` menilai `auth.uid()` sendiri), jadi peraturan kebenaran
 * hanya wujud di satu tempat — migration — dan bukan disalin ke dalam Deno.
 */
export async function requireMemberEditor(request: Request): Promise<string> {
  const authorization = request.headers.get('Authorization') ?? '';
  if (!authorization.startsWith('Bearer ')) {
    throw new RequestError('Token akses tiada. Sila log masuk semula.', 401);
  }

  const caller = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } },
  );

  const { data: userData, error: userError } = await caller.auth.getUser();
  if (userError || !userData.user) {
    throw new RequestError('Sesi tidak sah. Sila log masuk semula.', 401);
  }

  const { data: allowed, error: permissionError } = await caller.rpc('can_edit_members');
  if (permissionError) {
    throw new RequestError('Gagal mengesahkan kebenaran akaun.', 500);
  }
  if (allowed !== true) {
    throw new RequestError('Anda tiada kebenaran menyunting rekod ahli.', 403);
  }

  return userData.user.id;
}

/**
 * Sahkan pemanggil ialah Super Admin.
 *
 * Lebih ketat daripada `requireMemberEditor()` dengan sengaja: mencipta akaun
 * secara PUKAL, dengan kata laluan yang diketahui umum, bukan perkara yang
 * patut dibuka kepada kebenaran department.
 */
export async function requireSuperAdmin(request: Request): Promise<string> {
  const authorization = request.headers.get('Authorization') ?? '';
  if (!authorization.startsWith('Bearer ')) {
    throw new RequestError('Token akses tiada. Sila log masuk semula.', 401);
  }

  const caller = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } },
  );

  const { data: userData, error: userError } = await caller.auth.getUser();
  if (userError || !userData.user) {
    throw new RequestError('Sesi tidak sah. Sila log masuk semula.', 401);
  }

  const { data: allowed, error: permissionError } = await caller.rpc('is_super_admin');
  if (permissionError) {
    throw new RequestError('Gagal mengesahkan kebenaran akaun.', 500);
  }
  if (allowed !== true) {
    throw new RequestError('Tindakan ini khusus untuk Super Admin.', 403);
  }

  return userData.user.id;
}

/**
 * Kata laluan sementara — SATU nilai yang sama untuk setiap akaun baharu.
 *
 * Sebelum ini setiap ahli menerima 16 aksara rawak, yang bermakna admin perlu
 * menyampaikan rahsia yang berbeza kepada setiap orang secara individu. Itu
 * tidak boleh diskalakan kepada ratusan ahli: rahsia itu berakhir dalam satu
 * senarai WhatsApp, dan senarai sebegitu lebih teruk daripada tiada rahsia
 * langsung kerana ia kelihatan seperti rahsia.
 *
 * Jadi nilainya diketahui umum dengan sengaja, dan perlindungannya dipindahkan
 * ke tempat lain: akaun ditandakan `must_change_password` dan tetingkapnya TAMAT
 * dalam tiga hari. Selepas itu ia tidak lagi membuka apa-apa, dan hanya Super
 * Admin boleh membukanya semula.
 */
export const TEMP_PASSWORD = 'ikhwandihati';

/** Tempoh kata laluan sementara sah — sama untuk cipta seorang dan cipta pukal. */
export const TEMP_PASSWORD_DAYS = 3;

export function tempPasswordExpiry(): string {
  return new Date(Date.now() + TEMP_PASSWORD_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

/** Baca badan JSON, dengan mesej BM bila bentuknya salah. */
export async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    if (!body || typeof body !== 'object') throw new Error('bukan objek');
    return body as Record<string, unknown>;
  } catch {
    throw new RequestError('Permintaan tidak sah.');
  }
}

export function text(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}
