import type { EventType } from '@/types/database';

import { toMalayError } from './errors';
import { LocationError, readCurrentCoords, type Coords } from './geolocation';
import { supabase } from './supabase';

/**
 * Laluan kehadiran ahli: kod QR → program → lokasi → rekod.
 *
 * Tiada satu pun syarat kehadiran disemak di sini. Modul ini mengumpul tiga
 * nombor (token, latitud, longitud) dan menyerahkannya kepada
 * `record_usrah_attendance()`, yang mengadili semuanya di pelayan — lihat
 * `20260907000010_usrah_attendance_scans.sql`. Menyemak geofence atau tarikh
 * luput di sebelah sini hanya akan menambah semakan kedua yang boleh dilangkau
 * dengan menyunting app, dan mesej yang boleh bercanggah dengan jawapan sebenar.
 */

/** 'scan' = kamera langsung, 'upload' = kod QR dibaca daripada gambar galeri. */
export type ScanMethod = 'scan' | 'upload';

export type ScannedEvent = {
  id: string;
  name: string;
  event_type: EventType;
  /** 'YYYY-MM-DD'. Acara satu hari mempunyai tarikh mula dan tamat yang sama. */
  start_date: string;
  end_date: string;
  /** 'HH:MM:SS'. */
  start_time: string;
  end_time: string;
  location_text: string | null;
  geofence_radius_meters: number;
  valid_until: string;
  is_active: boolean;
  /** Acara tanpa pin tidak boleh disemak jaraknya — kehadirannya diterima tanpa GPS. */
  has_pin: boolean;
  /** 'bersemuka' = luar radius ditolak; 'hibrid' = luar radius dilabel online. */
  event_mode: 'bersemuka' | 'hibrid';
};

export type AttendanceResult = {
  event_name: string;
  event_type: EventType;
  start_date: string;
  end_date: string;
  start_time: string;
  end_time: string;
  /** `null` bagi acara tanpa pin lokasi, atau bila GPS tidak dapat dibaca. */
  distance_meters: number | null;
  /**
   * Label, bukan keputusan terima/tolak: dalam radius geofence = bersemuka,
   * di luar radius (atau tiada GPS pada acara berpin) = online.
   */
  attendance_mode: 'bersemuka' | 'online';
};

/**
 * Ralat yang MEMPUNYAI mesej untuk pengguna.
 *
 * Setiap penolakan RPC datang dengan ayat Bahasa Malaysia yang sudah menyebut
 * sebab sebenar — jarak dan had bagi geofence, misalnya. Ayat itu dibawa
 * sehingga ke skrin dan bukan digantikan dengan "ralat berlaku"; `code`
 * disimpan supaya skrin boleh memilih nada dan ikon tanpa mencocokkan teks.
 */
export class ScanError extends Error {
  readonly code: string;

  constructor(message: string, code = 'unknown') {
    super(message);
    this.name = 'ScanError';
    this.code = code;
  }
}

/*
  SQLSTATE yang dilontar sendiri oleh `record_usrah_attendance()`. Hanya kod
  dalam senarai ini yang mesejnya dipercayai cukup selamat dan cukup jelas untuk
  dipapar terus; apa-apa yang lain ialah kegagalan yang tidak dijangka dan
  melalui `toMalayError()` seperti biasa.
*/
const RPC_CODES = new Set(['P0001', 'P0002', 'P0003', 'P0004', 'P0005', 'P0006', 'P0007', 'P0008', '22023']);

/** Sudah hadir — skrin memaparkannya sebagai maklumat, bukan kegagalan. */
export const ALREADY_RECORDED = 'P0001';

function toScanError(error: unknown, fallback: string): ScanError {
  const code = typeof error === 'object' && error !== null && 'code' in error ? String((error as { code: unknown }).code) : '';

  if (RPC_CODES.has(code)) {
    const message = (error as { message?: unknown }).message;
    return new ScanError(typeof message === 'string' && message ? message : fallback, code);
  }

  return new ScanError(toMalayError(error, fallback), code || 'unknown');
}

/**
 * Acara yang dimiliki oleh kod QR ini, atau `null` bila token tidak dikenali.
 *
 * Acara yang tamat tempoh atau dimatikan TETAP dipulangkan. Skrin perlu tahu
 * acara apa yang baru diimbas untuk memberi mesej yang bermakna, dan keputusan
 * menerima atau menolak dibuat oleh `recordAttendance()`.
 *
 * Kedua-dua jenis acara — usrah bulanan dan program am — melalui laluan yang
 * SAMA. Dari sudut pandangan ahli tiada perbezaan langsung: dia mengimbas kod
 * dan mendapat pengesahan. Yang berbeza berlaku di pelayan, di mana hanya
 * kehadiran usrah mengalir ke grid dua belas bulan.
 */
export async function findEventByQrToken(qrToken: string): Promise<ScannedEvent | null> {
  const { data, error } = await supabase.rpc('usrah_event_by_qr_token', { p_qr_token: qrToken });

  if (error) throw toScanError(error, 'Gagal mencari program bagi kod QR ini.');

  const row = (data as ScannedEvent[] | null)?.[0];
  return row ?? null;
}

/**
 * Kod QR dihantar semula bersama id program. Id sahaja bukan bukti — ia
 * dipulangkan kepada setiap ahli oleh direktori acara — jadi pelayan menolak
 * tuntutan yang tidak membawa kod yang dipapar di lokasi.
 */
export async function recordAttendance(
  eventId: string,
  qrToken: string,
  coords: { latitude: number; longitude: number } | null,
  method: ScanMethod,
): Promise<AttendanceResult> {
  const { data, error } = await supabase.rpc('record_usrah_attendance', {
    p_event_id: eventId,
    p_qr_token: qrToken,
    p_latitude: coords?.latitude ?? null,
    p_longitude: coords?.longitude ?? null,
    p_method: method,
  });

  if (error) throw toScanError(error, 'Kehadiran tidak dapat direkodkan. Sila cuba lagi.');

  const row = (data as AttendanceResult[] | null)?.[0];
  if (!row) throw new ScanError('Kehadiran tidak dapat direkodkan. Sila cuba lagi.');

  return row;
}

/**
 * Koordinat semasa peranti untuk kehadiran.
 *
 * `Accuracy.High` (native) / `enableHighAccuracy` + bacaan segar (web):
 * geofence program biasanya berpuluh meter, dan ketepatan yang lebih longgar
 * boleh menolak seseorang yang berdiri betul-betul di dalam kawasan. Lihat
 * `geolocation.ts`. Kegagalan melontar `ScanError` dengan arahan yang boleh
 * dituruti, bukan mesej sistem.
 */
export async function currentCoords(): Promise<Coords> {
  try {
    return await readCurrentCoords();
  } catch (caught) {
    if (caught instanceof LocationError) throw new ScanError(caught.message, caught.code);
    throw new ScanError('Gagal membaca lokasi semasa. Pastikan GPS dihidupkan dan cuba lagi.', 'location_failed');
  }
}

/** Program yang sedang berlangsung dan dalam radius geofence lokasi ahli. */
export type NearbyEvent = {
  event_id: string;
  name: string;
  distance_meters: number;
};

/**
 * Program berdekatan untuk "Tekan Hadir". Pelayar menapis (aktif, QR hidup,
 * dalam masa, dalam radius, belum hadir); senarai kosong = tiada apa-apa untuk
 * dipaparkan. Sebarang ralat dipulangkan sebagai senarai kosong: ciri ini
 * tambahan dan tidak boleh mengganggu imbasan QR.
 */
export async function findNearbyEvents(coords: { latitude: number; longitude: number }): Promise<NearbyEvent[]> {
  const { data, error } = await supabase.rpc('nearby_active_events', {
    p_latitude: coords.latitude,
    p_longitude: coords.longitude,
  });
  if (error) return [];
  return (data as NearbyEvent[] | null) ?? [];
}

/**
 * Tekan Hadir. Koordinat dihantar semula dan jarak dikira SEMULA di pelayar
 * terhadap pin acara — senarai "berdekatan" tadi hanya cadangan, bukan bukti.
 */
export async function recordProximityAttendance(
  eventId: string,
  coords: { latitude: number; longitude: number },
): Promise<AttendanceResult> {
  const { data, error } = await supabase.rpc('record_attendance_proximity', {
    p_event_id: eventId,
    p_latitude: coords.latitude,
    p_longitude: coords.longitude,
  });

  if (error) throw toScanError(error, 'Kehadiran tidak dapat direkodkan. Sila cuba lagi.');

  const row = (data as AttendanceResult[] | null)?.[0];
  if (!row) throw new ScanError('Kehadiran tidak dapat direkodkan. Sila cuba lagi.');

  return row;
}
