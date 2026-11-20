import { useEffect, useState } from 'react';

/**
 * Menunda pembaruan nilai hingga tidak ada perubahan selama `delay` ms.
 * Dipakai untuk input pencarian/filter agar query database atau perhitungan
 * mahal tidak dijalankan pada setiap ketikan.
 */
export function useDebouncedValue<T>(value: T, delay = 250): T {
	const [debounced, setDebounced] = useState(value);
	useEffect(() => {
		const timer = window.setTimeout(() => setDebounced(value), delay);
		return () => window.clearTimeout(timer);
	}, [value, delay]);
	return debounced;
}
