import { useCallback, useRef, useState } from 'react';

/**
 * Membungkus aksi async dengan penjaga klik ganda dan indikator loading lokal
 * per item. `run(id, fn)` menyetel id sebagai sedang diproses selama fn
 * berjalan dan menolak pemanggilan ulang dengan id yang sama hingga selesai,
 * sehingga klik ganda pada tombol yang sama tidak memicu request duplikat.
 *
 * `pendingId` berisi id yang sedang diproses (atau null), dan `isPending(id)`
 * memeriksa apakah sebuah item tertentu sedang diproses — dipakai untuk
 * menampilkan indikator loading lokal pada baris/tombol yang relevan saja,
 * bukan loading global.
 */
export function usePendingAction() {
	const [pendingId, setPendingId] = useState<string | null>(null);
	const active = useRef<Set<string>>(new Set());

	const run = useCallback(
		async <T,>(id: string, fn: () => Promise<T>): Promise<T | undefined> => {
			if (active.current.has(id)) return undefined;
			active.current.add(id);
			setPendingId(id);
			try {
				return await fn();
			} finally {
				active.current.delete(id);
				setPendingId(prev => (prev === id ? null : prev));
			}
		},
		[],
	);

	const isPending = useCallback((id: string) => active.current.has(id), []);

	const reset = useCallback(() => {
		active.current.clear();
		setPendingId(null);
	}, []);

	return { run, pendingId, isPending, reset };
}
