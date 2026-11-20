/**
 * Verifikasi otomatis bukti transfer bank untuk pembayaran manual Pencari
 * Akuntan. Menggunakan model AI vision (Integrated AI) untuk membaca jumlah
 * transfer dan nama bank pada bukti, lalu mencocokkannya dengan nominal
 * tagihan dan bank tujuan yang dipilih pengguna.
 *
 * Server-only: memakai kredensial model platform dan akses superuser PocketBase
 * untuk membaca berkas bukti yang dilindungi. Tidak pernah dipanggil dari klien.
 */
import logger from '@/lib/logger.server';
import { pocketbaseAdmin } from '@/lib/pocketbase-client.server';

const requireEnv = (name: string): string => {
	const value = process.env[name];
	if (!value) {
		throw new Error(`${name} is not set — was Integrated AI enabled for this site?`);
	}
	return value;
};

const filesOrigin = () => `https://${requireEnv('WEBSITE_DOMAIN')}/hcgi/platform`;

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];

const SYSTEM_PROMPT = [
	'Kamu adalah asisten verifikasi bukti transfer bank.',
	'Analisis gambar bukti transfer yang dilampirkan dan ekstrak:',
	'(1) jumlah transfer dalam Rupiah sebagai angka,',
	'(2) nama bank yang tertera pada bukti.',
	'Kembalikan HANYA sebuah objek JSON yang valid, tanpa teks lain, tanpa markdown:',
	'{"readable": boolean, "amount": number|null, "bank_name": string|null, "confidence": "high"|"medium"|"low"}.',
	'- "readable" false jika gambar bukan bukti transfer atau tidak terbaca.',
	'- "amount" adalah nominal transfer numerik (cth. 49000 untuk Rp49.000). null jika tidak terbaca.',
	'- "bank_name" nama bank seperti tertera (cth. "BCA", "Mandiri"). null jika tidak terbaca.',
	'- "confidence" tingkat keyakinan keterbacaan jumlah dan bank.',
].join(' ');

export type ProofConfidence = 'high' | 'medium' | 'low';

export type ProofAnalysis = {
	readable: boolean;
	amount: number | null;
	bank_name: string | null;
	confidence: ProofConfidence | null;
};

export type VerificationOutcome = {
	/** true jika seluruh kecocokan berhasil dan langganan boleh diaktifkan otomatis. */
	verified: boolean;
	/** Penjelasan hasil dalam bahasa Indonesia untuk ditampilkan/disimpan. */
	reason: string;
	analysis: ProofAnalysis | null;
};

/** Normalisasi nama bank untuk perbandingan longgar. */
function normalizeBank(name: string): string {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9]/g, '');
}

/** Apakah nama bank pada bukti cocok dengan bank tujuan yang dipilih pengguna. */
function bankMatches(extracted: string | null, expected: string): boolean {
	if (!extracted || !expected) return false;
	const e = normalizeBank(extracted);
	const t = normalizeBank(expected);
	if (!e || !t) return false;
	return e.includes(t) || t.includes(e);
}

/** Apakah berkas bukti adalah gambar yang dapat dianalisis model vision. */
function isImageProof(filename: string): boolean {
	const lower = (filename ?? '').toLowerCase();
	return IMAGE_EXTENSIONS.some(ext => lower.endsWith(ext));
}

/** URL bukti yang ditandatangani token agar layanan model dapat mengambilnya. */
async function signedProofUrl(
	payment: { id: string; proof: string },
	collection: string,
): Promise<string> {
	const token = await pocketbaseAdmin.getFileToken();
	return `${filesOrigin()}/api/files/${collection}/${payment.id}/${payment.proof}?token=${encodeURIComponent(token)}`;
}

/** Memanggil model AI vision dan mengurai respons JSON dari aliran SSE. */
async function analyzeProof(imageUrl: string): Promise<ProofAnalysis | null> {
	const proxyEntranceId = process.env.PROXY_ENTRANCE_ID;

	const response = await fetch(`${requireEnv('INTEGRATED_AI_API_URL')}/generate`, {
		method: 'POST',
		headers: {
			'Accept': 'text/event-stream',
			'Content-Type': 'application/json',
			'Authorization': `Bearer ${requireEnv('INTEGRATED_AI_API_KEY')}`,
			...(proxyEntranceId && { 'X-Proxy-Entrance-Id': proxyEntranceId }),
		},
		body: JSON.stringify({
			website_id: process.env.WEBSITE_ID,
			history: [
				{
					role: 'user',
					content: 'Verifikasi bukti transfer berikut. Kembalikan JSON sesuai instruksi.',
					images: [imageUrl],
				},
			],
			system_prompt: SYSTEM_PROMPT,
			stream: true,
			environment: process.env.NODE_ENV === 'production' ? 'prod' : 'dev',
		}),
	});

	if (!response.ok || !response.body) {
		const details = await response.text().catch(() => 'unknown error');
		throw new Error(`Model request failed with status ${response.status}: ${details}`);
	}

	const text = await readSseContent(response.body);
	return parseAnalysis(text);
}

/** Membaca aliran SSE dan menggabungkan semua frame konten menjadi teks. */
async function readSseContent(stream: ReadableStream<Uint8Array>): Promise<string> {
	const reader = stream.getReader();
	const decoder = new TextDecoder();
	let buffer = '';
	let content = '';

	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;

			buffer += decoder.decode(value, { stream: true });
			const frames = buffer.split('\n\n');
			buffer = frames.pop() ?? '';

			for (const frame of frames) {
				const payload = frame
					.split('\n')
					.filter(line => line.startsWith('data: '))
					.map(line => line.slice('data: '.length))
					.join('');

				if (!payload || payload === '[DONE]') continue;

				try {
					const event = JSON.parse(payload) as { type?: string; data?: { content?: string } };
					if (event.type === 'content' && typeof event.data?.content === 'string') {
						content += event.data.content;
					}
				} catch {
					// abaikan frame yang tidak terurai
				}
			}
		}
	} finally {
		await reader.cancel().catch(() => {});
	}

	return content;
}

/** Mengekstrak objek JSON pertama dari teks respons model. */
function parseAnalysis(text: string): ProofAnalysis | null {
	if (!text) return null;

	// Ambil blok JSON pertama (model terkadang membungkus dalam ```json ... ```).
	const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
	const candidate = fenceMatch ? fenceMatch[1] : text;

	const jsonMatch = candidate.match(/\{[\s\S]*\}/);
	if (!jsonMatch) return null;

	try {
		const parsed = JSON.parse(jsonMatch[0]) as Partial<ProofAnalysis>;
		return {
			readable: Boolean(parsed.readable),
			amount: typeof parsed.amount === 'number' ? parsed.amount : null,
			bank_name: typeof parsed.bank_name === 'string' ? parsed.bank_name : null,
			confidence:
				parsed.confidence === 'high' || parsed.confidence === 'medium' || parsed.confidence === 'low'
					? parsed.confidence
					: null,
		};
	} catch {
		return null;
	}
}

/**
 * Menjalankan verifikasi otomatis terhadap sebuah pembayaran manual.
 *
 * Mengaktifkan langganan otomatis HANYA jika: bukti adalah gambar yang dapat
 * dibaca, keyakinan tinggi, jumlah transfer sama persis dengan nominal unik
 * transaksi (harga paket + kode tiga digit), dan nama bank pada bukti cocok
 * dengan bank tujuan yang dipilih pengguna. Jika salah satu gagal, mengembalikan
 * verified=false agar pembayaran tetap di antrean verifikasi manual Admin Pusat.
 */
export async function verifyManualPaymentProof(
	payment: {
		id: string;
		proof: string;
		expected_amount: number;
		bank: string;
	},
	collection: string = 'pencari_manual_payments',
): Promise<VerificationOutcome> {
	if (!payment.proof) {
		return { verified: false, reason: 'Bukti pembayaran tidak ditemukan.', analysis: null };
	}

	if (!isImageProof(payment.proof)) {
		// PDF atau format lain tidak dapat dianalisis model vision → verifikasi manual.
		return {
			verified: false,
			reason: 'Bukti berupa PDF/format non-gambar, perlu verifikasi manual admin.',
			analysis: null,
		};
	}

	const expectedAmount = payment.expected_amount;
	if (!Number.isFinite(expectedAmount) || expectedAmount <= 0) {
		return { verified: false, reason: 'Nominal unik transaksi tidak valid.', analysis: null };
	}

	let analysis: ProofAnalysis | null;
	try {
		const url = await signedProofUrl(payment, collection);
		analysis = await analyzeProof(url);
	} catch (error) {
		logger.error(
			`Verifikasi otomatis gagal: ${error instanceof Error ? error.message : String(error)}`,
		);
		return {
			verified: false,
			reason: 'Verifikasi otomatis gagal dijalankan, perlu verifikasi manual admin.',
			analysis: null,
		};
	}

	if (!analysis) {
		return {
			verified: false,
			reason: 'Bukti tidak dapat dibaca sistem, perlu verifikasi manual admin.',
			analysis: null,
		};
	}

	if (!analysis.readable) {
		return {
			verified: false,
			reason: 'Bukti transfer tidak terbaca, perlu verifikasi manual admin.',
			analysis,
		};
	}

	if (analysis.confidence !== 'high') {
		return {
			verified: false,
			reason: `Keyakinan verifikasi kurang (${analysis.confidence ?? 'tidak diketahui'}), perlu verifikasi manual admin.`,
			analysis,
		};
	}

	if (analysis.amount === null || analysis.amount !== expectedAmount) {
		const found = analysis.amount === null ? 'tidak terbaca' : `Rp${analysis.amount.toLocaleString('id-ID')}`;
		return {
			verified: false,
			reason: `Jumlah pada bukti (${found}) tidak sesuai tagihan (Rp${expectedAmount.toLocaleString('id-ID')}).`,
			analysis,
		};
	}

	if (!payment.bank || !bankMatches(analysis.bank_name, payment.bank)) {
		const found = analysis.bank_name ?? 'tidak terbaca';
		return {
			verified: false,
			reason: `Nama bank pada bukti (${found}) tidak cocok dengan bank tujuan (${payment.bank || 'tidak dipilih'}).`,
			analysis,
		};
	}

	return {
		verified: true,
		reason: `Verifikasi otomatis berhasil: jumlah Rp${analysis.amount.toLocaleString('id-ID')} dan bank ${analysis.bank_name} sesuai.`,
		analysis,
	};
}
