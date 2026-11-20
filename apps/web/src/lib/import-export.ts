/**
 * Helpers untuk fitur import/export CSV pada modul Catet Pajak.
 * Parsing & serialisasi CSV sederhana yang menangani kutipan, koma, dan baris baru.
 */

/** Mengunduh string sebagai file ke browser pengguna. */
export function downloadText(filename: string, content: string, mime = 'text/csv;charset=utf-8;'): void {
	const blob = new Blob([content], { type: mime });
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = filename;
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);
	URL.revokeObjectURL(url);
}

/** Meloloskan satu nilai CSV (membungkus dengan kutipan bila perlu). */
export function escapeCsvCell(value: unknown): string {
	if (value === null || value === undefined) return '';
	const str = String(value);
	if (/[",\n\r]/.test(str)) {
		return `"${str.replace(/"/g, '""')}"`;
	}
	return str;
}

/** Membangun teks CSV dari baris array of array. */
export function buildCsv(rows: (string | number | undefined | null)[][]): string {
	return rows.map(row => row.map(escapeCsvCell).join(',')).join('\r\n');
}

/** Mengekspor daftar baris (header + data) sebagai file CSV. */
export function exportCsv(filename: string, rows: (string | number | undefined | null)[][]): void {
	// BOM agar Excel membaca UTF-8 dengan benar.
	downloadText(filename, '\uFEFF' + buildCsv(rows));
}

/**
 * Parser CSV sederhana. Mengembalikan array of array string.
 * Mendukung kutipan ganda, koma di dalam kutipan, dan baris baru di dalam kutipan.
 */
export function parseCsv(text: string): string[][] {
	const rows: string[][] = [];
	let row: string[] = [];
	let field = '';
	let inQuotes = false;
	let i = 0;

	// Normalisasi akhir baris.
	const src = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

	while (i < src.length) {
		const char = src[i];

		if (inQuotes) {
			if (char === '"') {
				if (src[i + 1] === '"') {
					field += '"';
					i += 2;
					continue;
				}
				inQuotes = false;
				i += 1;
				continue;
			}
			field += char;
			i += 1;
			continue;
		}

		if (char === '"') {
			inQuotes = true;
			i += 1;
			continue;
		}
		if (char === ',') {
			row.push(field);
			field = '';
			i += 1;
			continue;
		}
		if (char === '\n') {
			row.push(field);
			field = '';
			rows.push(row);
			row = [];
			i += 1;
			continue;
		}
		field += char;
		i += 1;
	}

	// Baris terakhir tanpa newline.
	if (field.length > 0 || row.length > 0) {
		row.push(field);
		rows.push(row);
	}

	// Buang baris kosong akhir.
	return rows.filter(r => r.length > 1 || (r.length === 1 && r[0] !== ''));
}

/** Membaca file dari <input type="file"> sebagai teks. */
export function readFileAsText(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(String(reader.result ?? ''));
		reader.onerror = () => reject(reader.error);
		reader.readAsText(file);
	});
}

/** Membaca file CSV dan mengembalikan { headers, rows }. Baris header pertama. */
export async function readCsvFile(file: File): Promise<{ headers: string[]; rows: string[][] }> {
	const text = await readFileAsText(file);
	const parsed = parseCsv(text);
	if (parsed.length === 0) return { headers: [], rows: [] };
	const headers = parsed[0].map(h => h.trim());
	const rows = parsed.slice(1).map(r => r.map(c => c.trim()));
	return { headers, rows };
}

/** Membuat nama file dengan timestamp. */
export function timestampedFilename(prefix: string, ext = 'csv'): string {
	const now = new Date();
	const pad = (n: number) => String(n).padStart(2, '0');
	const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
	return `${prefix}-${stamp}.${ext}`;
}
