import type { AdminActivity } from './activity-log';

/*
  Fail berasingan dan tanpa import nilai (hanya jenis) supaya logik
  pengumpulan boleh diuji terus dengan Node, tanpa klien Supabase atau
  React Native.
*/

/** Satu blok paparan: tindakan seorang admin pada satu hari (waktu tempatan). */
export type ActivityGroup = {
  key: string;
  actorId: string | null;
  actorName: string;
  /** `created_at` tindakan TERKINI dalam blok — sumber tarikh kepala blok. */
  latestAt: string;
  rows: AdminActivity[];
};

/**
 * Kumpul rekod ikut (admin, hari).
 *
 * Input mesti tersusun terkini dahulu, seperti yang dipulangkan
 * `fetchAdminActivity`. `Map` mengekalkan susunan kemasukan, jadi blok
 * tersusun ikut tindakan terbaharunya dan rekod dalam blok kekal terkini dahulu
 * — tanpa pengisihan kedua. Kerana pengumpulan dibuat ke atas SEMUA rekod yang
 * sudah dimuat, halaman "Muat lagi" bergabung ke dalam blok sedia ada.
 *
 * Kunci guna `actor_id` dan bukan nama: nama ialah salinan pada masa tindakan,
 * dan admin yang menukar nama pada hari yang sama masih satu orang.
 */
export function groupActivity(rows: AdminActivity[]): ActivityGroup[] {
  const groups = new Map<string, ActivityGroup>();

  for (const row of rows) {
    const at = new Date(row.created_at);
    const day = at.getFullYear() + '-' + (at.getMonth() + 1) + '-' + at.getDate();
    const key = (row.actor_id ?? 'nama:' + row.actor_name) + '|' + day;

    const group = groups.get(key);
    if (group) {
      group.rows.push(row);
    } else {
      groups.set(key, {
        key,
        actorId: row.actor_id,
        actorName: row.actor_name,
        latestAt: row.created_at,
        rows: [row],
      });
    }
  }

  return [...groups.values()];
}
