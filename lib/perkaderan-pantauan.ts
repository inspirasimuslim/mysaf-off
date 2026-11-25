import type { DeliveryMode, DeliveryResult } from "./file-delivery";
import { fetchSilibus } from "./perkaderan-program";
import { supabase } from "./supabase";

export const BULAN_PENDEK = [
  "Jan",
  "Feb",
  "Mac",
  "Apr",
  "Mei",
  "Jun",
  "Jul",
  "Ogo",
  "Sep",
  "Okt",
  "Nov",
  "Dis",
];

type SesiRow = {
  group_id: string;
  session_date: string;
  jenis: "fikrah" | "bonding";
  topik: string | null;
  silibus_ids: string[] | null;
};

/** Satu sel bulan: tiada sesi -> kosong. `kod` ringkas untuk skrin, `penuh` untuk Excel. */
export type SelBulan = { kod: string; penuh: string };

/** Peta `group_id` -> 12 bulan (indeks 0 = Januari) bagi satu tahun. */
export async function fetchPantauanBulanan(
  tahun: number,
): Promise<Map<string, (SelBulan[] | null)[]>> {
  const [silibus, res] = await Promise.all([
    fetchSilibus(),
    supabase
      .from("sekolah_usrah_sessions")
      .select("group_id, session_date, jenis, topik, silibus_ids")
      .gte("session_date", tahun + "-01-01")
      .lte("session_date", tahun + "-12-31")
      .order("session_date"),
  ]);
  if (res.error) throw res.error;
  const byId = new Map(silibus.map((s) => [s.id, s]));
  const out = new Map<string, (SelBulan[] | null)[]>();

  for (const s of (res.data as SesiRow[] | null) ?? []) {
    const bulan = Number.parseInt(s.session_date.slice(5, 7), 10) - 1;
    if (!(bulan >= 0 && bulan < 12)) continue;
    const sel: SelBulan[] = [];
    const ids = (s.silibus_ids ?? [])
      .map((id) => byId.get(id))
      .filter((x): x is NonNullable<typeof x> => Boolean(x));
    if (ids.length > 0) {
      for (const f of ids)
        sel.push({
          kod: "F" + f.urutan,
          penuh: "F" + f.urutan + " " + f.tajuk,
        });
    } else if (s.jenis === "bonding") {
      sel.push({ kod: "Bonding", penuh: "Bonding" });
    } else {
      // Sesi import (Google Form): teks "Fikrah 1 : Dakwah Islamiyyah" dalam `topik`.
      const teks = (s.topik ?? "").trim();
      const nombor = [...teks.matchAll(/fikrah\s*(\d+)/gi)].map((m) => m[1]!);
      if (nombor.length > 0)
        for (const n of nombor) sel.push({ kod: "F" + n, penuh: teks });
      else
        sel.push({
          kod: teks ? teks.slice(0, 14) : "Ada",
          penuh: teks || "Ada sesi",
        });
    }
    const baris =
      out.get(s.group_id) ??
      Array.from({ length: 12 }, () => null as SelBulan[] | null);
    baris[bulan] = [...(baris[bulan] ?? []), ...sel];
    out.set(s.group_id, baris);
  }
  return out;
}

export type PantauanBaris = {
  sekolah: string;
  tingkatan: string;
  no: number;
  naqib: string; // "Nama (i28), Nama (i29)"
  bulan: (SelBulan[] | null)[];
};

/** Excel: satu baris setiap kumpulan, lajur Jan–Dis ("Tiada usrah" atau Fikrah dibuat), mengikut sekolah > tingkatan > kumpulan. */
export async function downloadPantauanBulanan(
  baris: PantauanBaris[],
  tahun: number,
  mode: DeliveryMode,
): Promise<{ rows: number; fileName: string; result: DeliveryResult }> {
  const XLSX = await import("xlsx");
  const { deliverWorkbook } = await import("./xlsx-download");
  const rows = baris.map((b) => {
    const r: Record<string, string | number> = {
      Sekolah: b.sekolah,
      Tingkatan: "T" + b.tingkatan,
      Kumpulan: b.no,
      Naqib: b.naqib,
    };
    BULAN_PENDEK.forEach((nama, i) => {
      const sel = b.bulan[i];
      r[nama] =
        sel && sel.length > 0
          ? sel.map((x) => x.penuh).join(" | ")
          : "Tiada usrah";
    });
    return r;
  });
  const sheet = XLSX.utils.json_to_sheet(rows);
  sheet["!cols"] = [
    { wch: 28 },
    { wch: 10 },
    { wch: 9 },
    { wch: 40 },
    ...BULAN_PENDEK.map(() => ({ wch: 30 })),
  ];
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Usrah " + tahun);
  const fileName = "pantauan-usrah-" + tahun + ".xlsx";
  const result = await deliverWorkbook(
    book,
    fileName,
    "Pantauan Usrah " + tahun,
    mode,
  );
  return { rows: rows.length, fileName, result };
}
