/**
 * Terjemah ralat Supabase kepada Bahasa Malaysia.
 *
 * Padanan dibuat mengikut keutamaan:
 *  1. `error.code` — kod rasmi GoTrue, paling tepat dan stabil.
 *  2. `error.message` — sandaran bila kod tiada (versi lama / ralat rangkaian).
 */

/** Kod ralat rasmi GoTrue → mesej BM. */
const CODE_MAP: Record<string, string> = {
  // --- Emel ---
  email_exists: 'Emel ini sudah digunakan oleh akaun lain.',
  user_already_exists: 'Emel ini sudah digunakan oleh akaun lain.',
  email_address_invalid: 'Format emel tidak sah.',
  email_address_not_authorized: 'Emel ini tidak dibenarkan oleh tetapan pelayan.',
  email_not_confirmed: 'Emel anda belum disahkan. Sila semak peti masuk.',
  email_provider_disabled: 'Log masuk melalui emel telah dimatikan oleh pentadbir.',
  email_conflict_identity_not_deletable: 'Emel ini bercanggah dengan akaun lain yang sedia ada.',

  // --- Kata laluan ---
  weak_password: 'Kata laluan terlalu lemah. Cuba gabungkan huruf besar, huruf kecil, nombor dan simbol.',
  same_password: 'Kata laluan baharu mesti berbeza daripada kata laluan semasa.',
  invalid_credentials: 'Emel atau kata laluan tidak sah.',
  reauthentication_needed: 'Sila log masuk semula sebelum menukar kata laluan.',
  reauthentication_not_valid: 'Kod pengesahan semula tidak sah.',

  // --- Sesi ---
  session_not_found: 'Sesi telah tamat. Sila log masuk semula.',
  session_expired: 'Sesi telah tamat. Sila log masuk semula.',
  refresh_token_not_found: 'Sesi telah tamat. Sila log masuk semula.',
  refresh_token_already_used: 'Sesi telah tamat. Sila log masuk semula.',
  bad_jwt: 'Sesi tidak sah. Sila log masuk semula.',
  user_not_found: 'Akaun tidak dijumpai. Sila log masuk semula.',
  user_banned: 'Akaun ini telah disekat. Sila hubungi pentadbir.',

  // --- Had kadar & rangkaian ---
  over_request_rate_limit: 'Terlalu banyak cubaan. Sila cuba sebentar lagi.',
  over_email_send_rate_limit: 'Terlalu banyak emel dihantar. Sila cuba sebentar lagi.',
  request_timeout: 'Sambungan terlalu lama. Sila cuba lagi.',
  otp_expired: 'Pautan pengesahan telah luput. Sila mohon pautan baharu.',
};

/** Sandaran bila kod tiada — padanan pada teks mesej. */
const MESSAGE_MAP: { match: RegExp; message: string }[] = [
  { match: /invalid login credentials/i, message: 'Emel atau kata laluan tidak sah.' },
  { match: /email not confirmed/i, message: 'Emel anda belum disahkan. Sila semak peti masuk.' },
  { match: /user already registered|already been registered/i, message: 'Emel ini sudah digunakan oleh akaun lain.' },
  { match: /email address .* (is invalid|already)|invalid email|same_email/i, message: 'Format emel tidak sah.' },
  { match: /password should be at least/i, message: 'Kata laluan terlalu pendek (minimum 8 aksara).' },
  {
    match: /password is known to be weak|too weak|should contain at least/i,
    message: 'Kata laluan terlalu lemah. Cuba gabungkan huruf besar, huruf kecil, nombor dan simbol.',
  },
  {
    match: /new password should be different/i,
    message: 'Kata laluan baharu mesti berbeza daripada kata laluan semasa.',
  },
  { match: /for security purposes|rate limit|too many requests/i, message: 'Terlalu banyak cubaan. Sila cuba sebentar lagi.' },
  {
    match: /network request failed|fetch failed|failed to fetch|load failed|networkerror|timeout|timed out/i,
    message: 'Sambungan internet bermasalah. Sila semak talian anda dan cuba lagi.',
  },
  { match: /refresh token|session.*(expired|missing|not found)/i, message: 'Sesi telah tamat. Sila log masuk semula.' },
];

/** Kod ralat GoTrue, kalau ada. */
export function errorCode(error: unknown): string | null {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code: unknown }).code;
    if (typeof code === 'string' && code) return code;
  }
  return null;
}

function errorMessage(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return '';
}

export function toMalayError(error: unknown, fallback = 'Ralat tidak dijangka. Sila cuba lagi.'): string {
  const code = errorCode(error);
  if (code && CODE_MAP[code]) return CODE_MAP[code] as string;

  const raw = errorMessage(error);
  if (!raw) return fallback;

  const hit = MESSAGE_MAP.find((entry) => entry.match.test(raw));
  return hit ? hit.message : fallback;
}

/** Sesi tidak lagi sah — pemanggil biasanya perlu minta pengguna log masuk semula. */
export function isSessionError(error: unknown): boolean {
  const code = errorCode(error);
  if (code) {
    return ['session_not_found', 'session_expired', 'refresh_token_not_found', 'refresh_token_already_used', 'bad_jwt', 'user_not_found'].includes(
      code,
    );
  }
  return /refresh token|session.*(expired|missing|not found)/i.test(errorMessage(error));
}
