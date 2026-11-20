import { useState, type ReactNode } from 'react';
import { Download, Mail, Loader2, MoreHorizontal, Send, MessageCircle } from 'lucide-react';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import pb from '@/lib/pocketbase-client';
import { formatRupiah, type Company } from '@/lib/accounting';
import {
	printBusinessDocument,
	STAGE_CONFIG,
	type BusinessDocument,
	type DocumentDirection,
} from '@/lib/documents';
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useLanguage } from '@/hooks/use-language';

interface DocumentActionsProps {
	doc: BusinessDocument;
	company: Company;
	direction: DocumentDirection;
	/** 'menu' = satu tombol yang membuka opsi; 'full' = tombol berlabel di header form. */
	variant?: 'icon' | 'menu' | 'full';
	/** Item tambahan di dalam menu, sebelum aksi dokumen. */
	menuBefore?: ReactNode;
	/** Item tambahan di dalam menu, sesudah aksi dokumen. */
	menuAfter?: ReactNode;
}

export function DocumentActions({
	doc,
	company,
	direction,
	variant = 'icon',
	menuBefore,
	menuAfter,
}: DocumentActionsProps) {
	const { t } = useLanguage();
	const [emailOpen, setEmailOpen] = useState(false);
	const [toEmail, setToEmail] = useState('');
	const [note, setNote] = useState('');
	const [sending, setSending] = useState(false);

	const [waOpen, setWaOpen] = useState(false);
	const [waPhone, setWaPhone] = useState('');
	const [waMessage, setWaMessage] = useState('');
	const [waLoading, setWaLoading] = useState(false);

	const stageCfg = STAGE_CONFIG[doc.stage];
	const defaultEmail = doc.expand?.contact?.email || '';
	const contactPhone = doc.expand?.contact?.phone || '';

	const openEmail = () => {
		setToEmail(defaultEmail);
		setNote('');
		setEmailOpen(true);
	};

	const handleDownload = () => {
		printBusinessDocument(doc, company, direction);
	};

	const handleSend = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const recipient = toEmail.trim();
		if (!recipient || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(recipient)) {
			toast.error('Alamat email penerima tidak valid.');
			return;
		}
		const actorUserId = pb.authStore.record?.id ?? '';
		if (!actorUserId) {
			toast.error('Sesi login tidak ditemukan. Silakan login ulang.');
			return;
		}
		setSending(true);
		try {
			const res = await fetch('/api/document-email', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					docId: doc.id,
					toEmail: recipient,
					actorUserId,
					note: note.trim(),
				}),
			});
			const data = await res.json().catch(() => ({}));
			if (!res.ok) {
				throw new Error(data?.error || `Gagal mengirim email (${res.status}).`);
			}
			toast.success(`Dokumen ${stageCfg.singular} terkirim ke ${recipient}.`);
			setEmailOpen(false);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Gagal mengirim email.');
		} finally {
			setSending(false);
		}
	};

	const openWhatsApp = async () => {
		setWaPhone(normalizePhone(contactPhone));
		setWaMessage('');
		setWaOpen(true);
		setWaLoading(true);
		try {
			const res = await fetch('/api/invoice-pay-link', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ docId: doc.id }),
			});
			const data = await res.json().catch(() => ({}));
			if (!res.ok || !data?.payUrl) {
				throw new Error(data?.error || 'Gagal membuat tautan pembayaran.');
			}
			setWaMessage(buildWhatsAppMessage(doc, company, data.payUrl as string));
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Gagal menyiapkan pesan WhatsApp.');
			setWaOpen(false);
		} finally {
			setWaLoading(false);
		}
	};

	const handleSendWhatsApp = (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const raw = waPhone.trim();
		if (!raw) {
			toast.error('Nomor WhatsApp tujuan wajib diisi.');
			return;
		}
		const normalized = normalizePhone(raw);
		if (!/^\d{8,15}$/.test(normalized)) {
			toast.error('Nomor WhatsApp tidak valid. Gunakan format 62xxx.');
			return;
		}
		const text = encodeURIComponent(waMessage);
		const url = `https://wa.me/${normalized}?text=${text}`;
		window.open(url, '_blank', 'noopener,noreferrer');
		toast.success('Pesan WhatsApp dibuka di tab baru. Invoice tidak ditandai lunas.');
		setWaOpen(false);
	};

	if (variant === 'menu' || variant === 'icon') {
		const itemClass = 'min-h-11 cursor-pointer gap-2.5 rounded-lg px-3 text-sm font-semibold';
		return (
			<>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<button
							type="button"
							aria-label="Buka aksi dokumen"
							aria-haspopup="menu"
							className="inline-flex size-9 items-center justify-center rounded-lg border border-primary/30 text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
						>
							<MoreHorizontal className="size-4" />
						</button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" sideOffset={6} collisionPadding={12} className="w-56 rounded-xl p-1.5">
						{menuBefore}
						<DropdownMenuItem onSelect={handleDownload} className={itemClass}>
							<Download className="size-4 text-primary" /> {t('sales.action.download_pdf')}
						</DropdownMenuItem>
						<DropdownMenuItem onSelect={openEmail} className={itemClass}>
							<Mail className="size-4 text-primary" /> {t('sales.action.send_email')}
						</DropdownMenuItem>
						<DropdownMenuItem onSelect={openWhatsApp} className={itemClass}>
							<MessageCircle className="size-4 text-emerald-600" /> {t('sales.action.send_whatsapp')}
						</DropdownMenuItem>
						{menuAfter}
					</DropdownMenuContent>
				</DropdownMenu>
				<EmailDialog
					open={emailOpen}
					onOpenChange={setEmailOpen}
					toEmail={toEmail}
					setToEmail={setToEmail}
					note={note}
					setNote={setNote}
					sending={sending}
					onSubmit={handleSend}
					stageLabel={stageCfg.singular}
				/>
				<WhatsAppDialog
					open={waOpen}
					onOpenChange={setWaOpen}
					phone={waPhone}
					setPhone={setWaPhone}
					message={waMessage}
					setMessage={setWaMessage}
					loading={waLoading}
					onSubmit={handleSendWhatsApp}
					hasContactPhone={Boolean(contactPhone)}
				/>
			</>
		);
	}

	return (
		<>
			<div className="flex flex-wrap items-center gap-2">
				<button
					type="button"
					onClick={handleDownload}
					className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-4 py-2 text-xs font-bold text-foreground transition-colors hover:bg-accent"
				>
					<Download className="size-3.5" /> {t('sales.action.download_pdf')}
				</button>
				<button
					type="button"
					onClick={openEmail}
					className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-4 py-2 text-xs font-bold text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
				>
					<Mail className="size-3.5" /> {t('sales.action.send_email')}
				</button>
				<button
					type="button"
					onClick={openWhatsApp}
					className="inline-flex items-center gap-1.5 rounded-full border border-emerald-600/30 bg-emerald-50 px-4 py-2 text-xs font-bold text-emerald-700 transition-colors hover:bg-emerald-600 hover:text-white"
				>
					<MessageCircle className="size-3.5" /> {t('sales.action.send_whatsapp')}
				</button>
			</div>
			<EmailDialog
				open={emailOpen}
				onOpenChange={setEmailOpen}
				toEmail={toEmail}
				setToEmail={setToEmail}
				note={note}
				setNote={setNote}
				sending={sending}
				onSubmit={handleSend}
				stageLabel={stageCfg.singular}
			/>
			<WhatsAppDialog
				open={waOpen}
				onOpenChange={setWaOpen}
				phone={waPhone}
				setPhone={setWaPhone}
				message={waMessage}
				setMessage={setWaMessage}
				loading={waLoading}
				onSubmit={handleSendWhatsApp}
				hasContactPhone={Boolean(contactPhone)}
			/>
		</>
	);
}

/** Normalisasi nomor telepon Indonesia ke format 62xxx (tanpa + atau 0 di depan). */
function normalizePhone(value: string): string {
	const digits = (value || '').replace(/\D/g, '');
	if (digits.startsWith('62')) return digits;
	if (digits.startsWith('0')) return `62${digits.slice(1)}`;
	if (digits.startsWith('8')) return `62${digits}`;
	return digits;
}

/** Membangun pesan WhatsApp berbahasa Indonesia untuk invoice. */
function buildWhatsAppMessage(
	doc: BusinessDocument,
	company: Company,
	payUrl: string,
): string {
	const party = doc.expand?.contact?.name || doc.partner || 'Pelanggan';
	const docNo = doc.number || doc.id.slice(0, 8).toUpperCase();
	const amount = formatRupiah(Number(doc.total) || 0);
	const companyName = company.name || 'Perusahaan';
	return [
		`Yth. ${party},`,
		'',
		`Berikut invoice ${docNo} sebesar ${amount} dari ${companyName}.`,
		'',
		'Mohon lakukan pembayaran melalui tautan berikut:',
		payUrl,
		'',
		'Anda dapat melihat rekening tujuan dan mengunggah bukti transfer pada tautan tersebut. Membuka tautan tidak menandai invoice sebagai lunas.',
		'',
		'Terima kasih.',
	].join('\n');
}

interface EmailDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	toEmail: string;
	setToEmail: (value: string) => void;
	note: string;
	setNote: (value: string) => void;
	sending: boolean;
	onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
	stageLabel: string;
}

function EmailDialog({
	open,
	onOpenChange,
	toEmail,
	setToEmail,
	note,
	setNote,
	sending,
	onSubmit,
	stageLabel,
}: EmailDialogProps) {
	const { t } = useLanguage();
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{t('sales.email.title', { stage: stageLabel })}</DialogTitle>
					<DialogDescription>
						{t('sales.email.desc')}
					</DialogDescription>
				</DialogHeader>
				<form onSubmit={onSubmit} className="flex flex-col gap-4">
					<div className="flex flex-col gap-2">
						<label htmlFor="doc-email-to" className="text-xs font-semibold">
							{t('sales.email.recipient')}
						</label>
						<Input
							id="doc-email-to"
							type="email"
							required
							value={toEmail}
							onChange={e => setToEmail(e.target.value)}
							placeholder="nama@contoh.com"
						/>
					</div>
					<div className="flex flex-col gap-2">
						<label htmlFor="doc-email-note" className="text-xs font-semibold">
							{t('sales.email.note')}
						</label>
						<Textarea
							id="doc-email-note"
							value={note}
							onChange={e => setNote(e.target.value)}
							placeholder={t('sales.email.note_placeholder')}
							rows={3}
						/>
					</div>
					<DialogFooter>
						<button
							type="button"
							onClick={() => onOpenChange(false)}
							className="rounded-full border border-border px-4 py-2 text-xs font-bold text-muted-foreground transition-colors hover:bg-secondary"
						>
							{t('sales.form.cancel')}
						</button>
						<button
							type="submit"
							disabled={sending}
							className="inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-2 text-xs font-bold text-primary-foreground shadow-soft-sm transition-transform hover:-translate-y-0.5 disabled:opacity-60"
						>
							{sending ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
							{sending ? t('sales.email.sending') : t('sales.email.send')}
						</button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

interface WhatsAppDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	phone: string;
	setPhone: (value: string) => void;
	message: string;
	setMessage: (value: string) => void;
	loading: boolean;
	onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
	hasContactPhone: boolean;
}

function WhatsAppDialog({
	open,
	onOpenChange,
	phone,
	setPhone,
	message,
	setMessage,
	loading,
	onSubmit,
	hasContactPhone,
}: WhatsAppDialogProps) {
	const { t } = useLanguage();
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{t('sales.wa.title')}</DialogTitle>
					<DialogDescription>
						{hasContactPhone
							? 'Nomor WhatsApp pelanggan telah terisi. Anda dapat mengubahnya bila perlu.'
							: 'Nomor WhatsApp pelanggan tidak tersedia. Masukkan nomor tujuan terlebih dahulu.'}
						{' '}Membuka pesan tidak menandai invoice sebagai lunas.
					</DialogDescription>
				</DialogHeader>
				<form onSubmit={onSubmit} className="flex flex-col gap-4">
					<div className="flex flex-col gap-2">
						<label htmlFor="doc-wa-phone" className="text-xs font-semibold">
							{t('sales.wa.phone')}
						</label>
						<Input
							id="doc-wa-phone"
							type="tel"
							required
							value={phone}
							onChange={e => setPhone(e.target.value)}
							placeholder="62xxxxxxxxxxx"
						/>
						<p className="text-[11px] text-muted-foreground">
							{t('sales.wa.phone_hint')}
						</p>
					</div>
					<div className="flex flex-col gap-2">
						<label htmlFor="doc-wa-message" className="text-xs font-semibold">
							{t('sales.wa.message')}
						</label>
						<Textarea
							id="doc-wa-message"
							value={message}
							onChange={e => setMessage(e.target.value)}
							rows={8}
							disabled={loading}
							placeholder={loading ? t('sales.wa.preparing') : t('sales.wa.message')}
						/>
					</div>
					<DialogFooter>
						<button
							type="button"
							onClick={() => onOpenChange(false)}
							className="rounded-full border border-border px-4 py-2 text-xs font-bold text-muted-foreground transition-colors hover:bg-secondary"
						>
							{t('sales.form.cancel')}
						</button>
						<button
							type="submit"
							disabled={loading}
							className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-5 py-2 text-xs font-bold text-white shadow-soft-sm transition-transform hover:-translate-y-0.5 disabled:opacity-60"
						>
							{loading ? <Loader2 className="size-3.5 animate-spin" /> : <MessageCircle className="size-3.5" />}
							{loading ? t('sales.wa.preparing') : t('sales.wa.open')}
						</button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
