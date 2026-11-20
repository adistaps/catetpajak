/** Kandidat pengguna yang bisa disebut (mention) pada teks. */
export type MentionCandidate = {
	id: string;
	name: string;
};

/** Batas panjang token yang diketik setelah "@" sebelum pemilih ditutup. */
export const MENTION_TOKEN_MAX = 60;

const TOKEN_CHAR = /[\p{L}\p{N}_.-]/u;

/**
 * Mendeteksi mention yang sedang diketik pada posisi kursor.
 * Mengembalikan teks setelah "@" dan posisi awal "@" bila aktif.
 */
export function extractMentionQuery(
	text: string,
	caret: number,
): { query: string; start: number } | null {
	let index = caret - 1;
	while (index >= 0) {
		const char = text[index];
		if (char === '@') {
			const before = index > 0 ? text[index - 1] : '';
			if (index === 0 || /\s/.test(before)) {
				const token = text.slice(index + 1, caret);
				if (token.length <= MENTION_TOKEN_MAX) {
					return { query: token, start: index };
				}
			}
			return null;
		}
		if (!TOKEN_CHAR.test(char)) return null;
		index -= 1;
	}
	return null;
}

/** Menyisipkan mention @[Nama] menggantikan token yang sedang diketik. */
export function insertMention(
	text: string,
	start: number,
	caret: number,
	name: string,
): { text: string; caret: number } {
	const clean = name.replace(/[@[\]\n]/g, '').trim().slice(0, MENTION_TOKEN_MAX) || 'Pengguna';
	const replacement = `@[${clean}] `;
	return {
		text: text.slice(0, start) + replacement + text.slice(caret),
		caret: start + replacement.length,
	};
}

/** Bagian teks biasa atau mention untuk ditampilkan dengan gaya jelas. */
export type MentionPart = { type: 'text' | 'mention'; value: string };

/** Memecah teks menjadi bagian biasa dan mention @[Nama]. */
export function splitMentionText(text: string): MentionPart[] {
	const parts: MentionPart[] = [];
	const pattern = /@\[([^\]\n]+)\]/g;
	let last = 0;
	let match: RegExpExecArray | null;
	while ((match = pattern.exec(text)) !== null) {
		if (match.index > last) {
			parts.push({ type: 'text', value: text.slice(last, match.index) });
		}
		parts.push({ type: 'mention', value: match[1] });
		last = pattern.lastIndex;
	}
	if (last < text.length) {
		parts.push({ type: 'text', value: text.slice(last) });
	}
	return parts;
}

/** Menghapus kandidat dengan nama kosong atau duplikat (tanpa peduli kapital). */
export function dedupeCandidates(list: MentionCandidate[]): MentionCandidate[] {
	const seen = new Set<string>();
	const out: MentionCandidate[] = [];
	for (const candidate of list) {
		const name = candidate.name?.trim();
		if (!name) continue;
		const key = name.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		out.push({ id: candidate.id, name });
	}
	return out;
}
