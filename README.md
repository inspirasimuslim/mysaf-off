# mysaf-off

Aplikasi Expo (React Native + TypeScript + Expo Router) untuk pengurusan saf & kehadiran.
Satu codebase untuk **iOS, Android dan Web**.

- Expo SDK 57 · React Native 0.86 · React 19.2
- NativeWind v4 + Tailwind CSS v3 (design tokens dalam `tailwind.config.js`)
- Supabase Auth (emel + kata laluan) dengan storan sesi `expo-secure-store`
- Log masuk biometrik melalui `expo-local-authentication`

## Menjalankan aplikasi

```bash
npm install
npx expo start          # imbas QR dengan Expo Go
npx expo start --android
npx expo start --ios
npx expo start --web
```

Testing dilakukan melalui **Expo Go** (tiada EAS Build diperlukan).

## Persekitaran

Salin `.env.example` kepada `.env` dan isikan nilai dari Supabase Dashboard
(*Project Settings > API*):

```
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
```

`.env` tidak dikomit (lihat `.gitignore`). Selagi kedua-dua nilai kosong,
skrin log masuk akan memaparkan amaran dan tidak memanggil Supabase.

## Struktur

```
app/
  _layout.tsx              # AuthProvider + Stack + import global.css
  index.tsx                # hala ke dashboard atau login
  (auth)/login.tsx         # skrin log masuk (+ butang biometrik)
  (app)/_layout.tsx        # bottom tab (5 tab), guard sesi
  (app)/dashboard.tsx      # salam, ringkasan, tetapan akaun, log keluar
  (app)/{kehadiran,aktiviti,ahli,profil}.tsx
components/                # ScreenHeader + komponen UI boleh guna semula
constants/theme.ts         # token warna/radius (selari dengan Tailwind)
lib/
  supabase.ts              # client Supabase
  secure-storage.ts        # adapter SecureStore (chunked) / localStorage
  biometrics.ts            # sokongan & bendera biometrik
  auth-context.tsx         # keadaan sesi
  errors.ts                # mesej ralat Bahasa Malaysia
```

## Design system

| Peranan | Warna |
| --- | --- |
| Utama (header, kad ringkasan, ikon aktif) | `#0F5132` |
| Pill/latar ikon aktif | `#E7F1EC` |
| Latar skrin | `#FAFAFA` |
| Teks | `#1A1A1A` |
| Positif / negatif / amaran / info | `#16A34A` / `#DC2626` / `#EA580C` / `#2563EB` |

Kad: radius 20px, padding lapang, bayang lembut, satu maklumat setiap kad.
