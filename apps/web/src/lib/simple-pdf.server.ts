/** PDF satu halaman tanpa dependensi, cukup untuk lampiran invoice di email. */
export function buildSimplePdf(lines: string[]): Uint8Array {
	const wrapped: string[] = [];
	for (const line of lines) {
		const text = line.replace(/[^\x20-\x7E]/g, ' ');
		if (text.length <= 92) {
			wrapped.push(text);
			continue;
		}
		for (let i = 0; i < text.length; i += 92) wrapped.push(text.slice(i, i + 92));
	}
	const commands = wrapped
		.slice(0, 46)
		.map((line, index) => {
			const y = 800 - index * 16;
			return `BT /F1 11 Tf 40 ${y} Td (${escapePdf(line)}) Tj ET`;
		})
		.join('\n');
	const stream = `${commands}\n`;
	const objects = [
		'1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n',
		'2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n',
		'3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj\n',
		`4 0 obj << /Length ${stream.length} >> stream\n${stream}endstream\nendobj\n`,
		'5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n',
	];
	let body = '%PDF-1.4\n';
	const offsets = [0];
	for (const object of objects) {
		offsets.push(body.length);
		body += object;
	}
	const xref = body.length;
	let xrefTable = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
	for (let i = 1; i < offsets.length; i += 1) {
		xrefTable += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
	}
	body += `${xrefTable}trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
	return new TextEncoder().encode(body);
}

function escapePdf(value: string): string {
	return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}
