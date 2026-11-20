import { withApi, apiError, json, readJsonBody } from '@/lib/api.server';
import { requireCentralAdmin } from '@/lib/central-admin.server';
import { pocketbaseAdmin } from '@/lib/pocketbase-client.server';

/**
 * Shape of the PocketBase settings object — only the fields we read/write are
 * typed; the rest is preserved verbatim so the PATCH round-trip does not drop
 * unrelated configuration.
 */
type PbSettings = {
	smtp: {
		enabled: boolean;
		host: string;
		port: number;
		tls: boolean;
		username: string;
		password: string;
	};
	meta: {
		senderAddress: string;
		senderName: string;
	};
	[key: string]: unknown;
};

export type SmtpSettingsSummary = {
	host: string;
	port: number;
	tls: boolean;
	username: string;
	enabled: boolean;
	senderAddress: string;
	senderName: string;
	/** Whether a password is already stored. The password itself is never returned. */
	passwordConfigured: boolean;
};

function sanitize(s: PbSettings): SmtpSettingsSummary {
	return {
		host: s.smtp?.host ?? '',
		port: Number(s.smtp?.port) || 465,
		tls: !!s.smtp?.tls,
		username: s.smtp?.username ?? '',
		enabled: !!s.smtp?.enabled,
		senderAddress: s.meta?.senderAddress ?? '',
		senderName: s.meta?.senderName ?? '',
		passwordConfigured: !!s.smtp?.password && s.smtp.password.length > 0,
	};
}

async function readPbSettings(): Promise<PbSettings> {
	return pocketbaseAdmin.send<PbSettings>('/api/settings', { method: 'GET' });
}

/**
 * POST /api/central-admin/smtp — baca pengaturan SMTP saat ini (tanpa kata sandi).
 * PATCH /api/central-admin/smtp — simpan pengaturan, atau kirim email uji coba
 *   saat `action: "test"`.
 *
 * Non-GET agar respons per-admin tidak di-cache edge. Hanya admin pusat.
 */
export const action = withApi(async ({ request }) => {
	await requireCentralAdmin(request);

	if (request.method === 'POST') {
		const settings = await readPbSettings();
		return json({ settings: sanitize(settings) });
	}

	if (request.method === 'PATCH') {
		const body = await readJsonBody<{
			action?: 'save' | 'test';
			host?: string;
			port?: number;
			tls?: boolean;
			username?: string;
			password?: string;
			senderAddress?: string;
			senderName?: string;
			enabled?: boolean;
			to?: string;
		}>(request);

		if (body.action === 'test') {
			const to = (body.to ?? '').trim();
			if (!to) throw apiError(422, 'Email penerima wajib diisi.');

			try {
				const result = await pocketbaseAdmin.send<{ ok?: boolean; via?: string; sender?: string }>(
					'/smtp-test',
					{ method: 'POST', body: { to } },
				);
				return json({ ok: true, via: result.via, sender: result.sender });
			} catch (err) {
				// The hook returns 502 with the raw SMTP/relay error in `error`.
				// Surface it verbatim (no credentials are included) so the admin can
				// act on it — `throw new Error(...)` would be collapsed to the generic
				// "Something went wrong!" by withApi in production and hide the cause.
				const responseError =
					err && typeof err === 'object' && 'response' in err
						? (err as { response?: { error?: string; message?: string } }).response
						: undefined;
				const detail =
					responseError?.error ??
					responseError?.message ??
					(err instanceof Error ? err.message : '') ??
					'Gagal mengirim email uji coba.';
				return apiError(502, `Pengiriman email uji coba gagal: ${detail}`);
			}
		}

		// action === 'save' (default)
		const current = await readPbSettings();
		const host = (body.host ?? '').trim();
		const username = (body.username ?? '').trim();
		const senderAddress = (body.senderAddress ?? '').trim();
		const senderName = (body.senderName ?? '').trim();
		const port = Number(body.port);

		if (!host) throw apiError(422, 'Host SMTP wajib diisi.');
		if (!Number.isFinite(port) || port < 1 || port > 65535) {
			throw apiError(422, 'Port tidak valid (1–65535).');
		}
		if (!senderAddress) throw apiError(422, 'Alamat email pengirim wajib diisi.');

		current.smtp.host = host;
		current.smtp.port = port;
		current.smtp.tls = !!body.tls;
		current.smtp.username = username;
		current.smtp.enabled = !!body.enabled;

		// Only overwrite the stored password when a new one is provided, so a
		// blank field on save preserves the existing credential.
		const newPassword = (body.password ?? '').trim();
		if (newPassword.length > 0) {
			current.smtp.password = newPassword;
		}
		if (current.smtp.enabled && !current.smtp.password) {
			throw apiError(422, 'Kata sandi SMTP wajib diisi sebelum mengaktifkan SMTP.');
		}

		current.meta.senderAddress = senderAddress;
		current.meta.senderName = senderName;

		await pocketbaseAdmin.send('/api/settings', { method: 'PATCH', body: current });
		const refreshed = await readPbSettings();
		return json({ settings: sanitize(refreshed) });
	}

	throw apiError(405, 'Metode tidak didukung.');
});
