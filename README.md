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
  _layout.tsx              # AuthProvider + PermissionsProvider + Stack
  index.tsx                # hala ke dashboard atau login
  (auth)/login.tsx         # skrin log masuk (+ butang biometrik)
  (app)/_layout.tsx        # bottom tab (5 tab), guard sesi
  (app)/dashboard.tsx      # salam, ringkasan, panel Super Admin, tetapan akaun
  (app)/{kehadiran,aktiviti,ahli,profil}.tsx
  (app)/admin/_layout.tsx        # guard: Super Admin sahaja
  (app)/admin/departments.tsx    # senarai/tambah/aktif/padam department
  (app)/admin/admins.tsx         # lantik admin + kebenaran per department
  (app)/admin/super-admins.tsx   # lantik / turunkan pangkat Super Admin
components/                # ScreenHeader + komponen UI boleh guna semula
constants/theme.ts         # token warna/radius (selari dengan Tailwind)
lib/
  supabase.ts              # client Supabase
  secure-storage.ts        # adapter SecureStore (chunked) / localStorage
  biometrics.ts            # sokongan & bendera biometrik
  auth-context.tsx         # keadaan sesi
  permissions.tsx          # context peranan + canView/canEdit/isSuperAdmin
  admin.ts                 # operasi CRUD panel Super Admin
  errors.ts                # mesej ralat Bahasa Malaysia
types/database.ts          # bentuk baris Supabase
supabase/migrations/       # skrip SQL untuk Supabase SQL Editor
```

## Role & Permission

Tiga peranan disimpan dalam `profiles.role`:

| Peranan | Akses |
| --- | --- |
| `super_admin` | Penuh — semua department, urus admin & Super Admin |
| `admin` | Hanya department dalam `admin_assignments` miliknya (`can_view` / `can_edit`) |
| `ahli` | Tiada akses pentadbiran |

Kuat kuasa sebenar ada pada **RLS Supabase**, bukan app — klien memegang anon key
sahaja, jadi semakan dalam app hanya menentukan apa yang dipapar.

### Pemasangan pangkalan data

1. Buka *Supabase Dashboard > SQL Editor*.
2. Jalankan `supabase/migrations/20260906000001_roles_permissions.sql` (idempotent).
3. Lantik Super Admin pertama dengan `supabase/bootstrap_super_admin.sql`
   (tukar emel di dalamnya kepada emel akaun anda) — panel dalam app tidak boleh
   melakukannya kerana RLS memerlukan seorang Super Admin sedia ada.

### Guna dalam kod

```ts
import { usePermissions } from '@/lib/permissions';

const { isSuperAdmin, canView, canEdit } = usePermissions();

if (canEdit(departmentId)) {
  // papar butang simpan
}
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
