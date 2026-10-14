/**
 * Had masa untuk panggilan rangkaian.
 *
 * Tanpa ini, satu panggilan yang tidak pernah dijawab (talian lemah, pelayan
 * perlahan) menahan skrin loading selama-lamanya. `withTimeout` menolak dengan
 * `TimeoutError` selepas `ms` milisaat; pemanggil memilih sama ada ia gagal-terbuka
 * (teruskan tanpa jawapan) atau gagal-tertutup (papar ralat + cuba semula).
 *
 * Panggilan asal TIDAK dibatalkan — hasil lewatnya diabaikan.
 */
export class TimeoutError extends Error {
  constructor(message = 'Permintaan mengambil masa terlalu lama.') {
    super(message);
    this.name = 'TimeoutError';
  }
}

export function withTimeout<T>(promise: PromiseLike<T>, ms: number, message?: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
