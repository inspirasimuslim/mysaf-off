import * as Location from 'expo-location';

import type { AttendanceMode, EventType } from '@/types/database';

import { toMalayError } from './errors';
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
  /**
   * Sama ada lokasi akan disemak bagi TOKEN ini. Acara tanpa pin, dan setiap
   * token online, mendapat `false` — kehadirannya diterima tanpa GPS.
   */
  has_pin: boolean;
  /** Token mana yang sepadan: `qr_token` (bersemuka) atau `online_qr_token` (online). */
  attendance_mode: AttendanceMode;
  online_valid_from: string | null;
  online_valid_until: string | null;
};

export type AttendanceResult = {
  event_name: string;
  event_type: EventType;
  start_date: string;
  end_date: string;
  start_time: string;
  end_time: string;
  /** `null` bagi acara tanpa pin lokasi dan bagi kehadiran online. */
  distance_meters: number | null;
  attendance_mode: AttendanceMode;
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
const RPC_CODES = new Set(['P0001', 'P0002', 'P0003', 'P0004', 'P0005', 'P0006', 'P0007', '22023']);

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
 * Koordinat semasa peranti.
 *
 * `Accuracy.High` dan bukan `Balanced`: geofence program biasanya berpuluh
 * meter, dan ketepatan yang lebih longgar boleh menolak seseorang yang berdiri
 * betul-betul di dalam kawasan. Kebenaran yang ditolak melontar `ScanError`
 * dengan arahan yang boleh dituruti, bukan mesej sistem.
 */
export async function currentCoords(): Promise<{ latitude: number; longitude: number }> {
  let permission: Location.LocationPermissionResponse;
  try {
    permission = await Location.requestForegroundPermissionsAsync();
  } catch {
    throw new ScanError('Perkhidmatan lokasi tidak tersedia pada peranti ini.', 'location_unavailable');
  }

  if (!permission.granted) {
    throw new ScanError(
      'Kebenaran lokasi diperlukan untuk merekod kehadiran. Benarkan capaian lokasi dalam tetapan peranti dan cuba lagi.',
      'location_denied',
    );
  }

  try {
    const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    return { latitude: position.coords.latitude, longitude: position.coords.longitude };
  } catch {
    throw new ScanError('Gagal membaca lokasi semasa. Pastikan GPS dihidupkan dan cuba lagi.', 'location_failed');
  }
}
