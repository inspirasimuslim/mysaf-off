-- =============================================================================
-- MySAFF — Peranan 'owner' (langkah 1/2: nilai enum)
--
-- `ALTER TYPE ... ADD VALUE` tidak boleh digunakan dalam transaksi yang sama
-- dengan penggunaan nilai baharu itu, jadi ia diasingkan ke fail sendiri.
-- Fail 63 mengandungi fungsi, trigger dan RPC yang merujuk 'owner'.
--
-- `profiles.role` ialah enum `user_role` (bukan CHECK constraint), jadi
-- "tambah nilai sah" bermakna menambah nilai enum.
-- =============================================================================

alter type public.user_role add value if not exists 'owner';
