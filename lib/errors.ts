/** Terjemah mesej ralat Supabase kepada Bahasa Malaysia yang ringkas. */
const MAP: { match: RegExp; message: string }[] = [
  { match: /invalid login credentials/i, message: 'Emel atau kata laluan tidak sah.' },
  { match: /email not confirmed/i, message: 'Emel anda belum disahkan. Sila semak peti masuk.' },
  { match: /user already registered|already been registered/i, message: 'Emel ini sudah didaftarkan.' },
  { match: /email address .* is invalid|invalid email/i, message: 'Format emel tidak sah.' },
  { match: /password should be at least/i, message: 'Kata laluan terlalu pendek (minimum 8 aksara).' },
  { match: /new password should be different/i, message: 'Kata laluan baharu mesti berbeza daripada yang lama.' },
  { match: /same_email|email address .* already/i, message: 'Emel ini sudah digunakan.' },
  { match: /for security purposes|rate limit|too many requests/i, message: 'Terlalu banyak cubaan. Sila cuba sebentar lagi.' },
  { match: /network request failed|fetch failed|failed to fetch/i, message: 'Sambungan internet bermasalah. Sila cuba lagi.' },
  { match: /refresh token|session.*(expired|missing|not found)/i, message: 'Sesi telah tamat. Sila log masuk semula.' },
];

export function toMalayError(error: unknown, fallback = 'Ralat tidak dijangka. Sila cuba lagi.'): string {
  const raw =
    typeof error === 'string'
      ? error
      : error instanceof Error
        ? error.message
        : typeof error === 'object' && error !== null && 'message' in error
          ? String((error as { message: unknown }).message)
          : '';

  if (!raw) return fallback;
  const hit = MAP.find((entry) => entry.match.test(raw));
  return hit ? hit.message : fallback;
}
