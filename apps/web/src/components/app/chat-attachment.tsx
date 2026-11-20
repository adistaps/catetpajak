import { Download, FileText, Mic } from 'lucide-react';
import {
	chatAttachmentName,
	chatAttachmentUrl,
	isAudioAttachment,
	isImageAttachment,
	type ChatMessage,
} from '@/lib/chat';

/**
 * Menampilkan lampiran pesan chat: pratinjau gambar untuk PNG, pemutar audio
 * untuk pesan suara, atau kartu tautan untuk PDF. Penerima dapat membuka atau
 * mengunduh file.
 */
export function ChatMessageAttachment({
	message,
}: {
	message: ChatMessage;
	mine?: boolean;
}) {
	if (!message.attachment) return null;
	const url = chatAttachmentUrl(message);
	const name = chatAttachmentName(message);

	if (isImageAttachment(message)) {
		return (
			<a
				href={url}
				target="_blank"
				rel="noopener noreferrer"
				className="mt-1 block overflow-hidden rounded-lg"
				title={name}
			>
				<img
					src={url}
					alt={name}
					loading="lazy"
					className="max-h-60 w-full max-w-full object-cover transition-opacity hover:opacity-90 sm:max-w-[260px]"
				/>
			</a>
		);
	}

	if (isAudioAttachment(message)) {
		return (
			<div className="mt-1 flex w-full min-w-0 max-w-full items-center gap-2 rounded-lg border border-[#e6ecea] bg-white px-2.5 py-2 text-sm">
				<span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-emerald-50 text-emerald-600">
					<Mic className="size-4" />
				</span>
				<audio controls preload="metadata" className="min-w-0 w-full max-w-full flex-1">
					<source src={url} />
				</audio>
				<a
					href={url}
					target="_blank"
					rel="noopener noreferrer"
					download={name}
					className="flex size-7 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
					aria-label="Unduh pesan suara"
					title="Unduh"
				>
					<Download className="size-4" />
				</a>
			</div>
		);
	}

	return (
		<a
			href={url}
			target="_blank"
			rel="noopener noreferrer"
			download={name}
			className="mt-1 flex items-center gap-2.5 rounded-lg border border-[#e6ecea] bg-white px-3 py-2 text-sm text-foreground transition-colors hover:bg-[#f4f7f6]"
		>
			<span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-rose-50 text-rose-600">
				<FileText className="size-4" />
			</span>
			<span className="min-w-0 flex-1">
				<span className="block truncate font-medium">{name}</span>
				<span className="text-[11px] text-muted-foreground">PDF</span>
			</span>
			<Download className="size-4 shrink-0 text-muted-foreground" />
		</a>
	);
}
