import { splitMentionText } from '@/lib/mentions';

/** Teks posting/komentar dengan mention @[Nama] yang ditampilkan jelas. */
export function MentionText({ text, className }: { text: string; className?: string }) {
	const parts = splitMentionText(text ?? '');
	if (parts.length === 1 && parts[0].type === 'text') {
		return <p className={className}>{parts[0].value}</p>;
	}
	return (
		<p className={className}>
			{parts.map((part, index) =>
				part.type === 'mention' ? (
					<span
						key={index}
						className="rounded-full bg-emerald-50 px-1.5 font-semibold text-emerald-700"
					>
						@{part.value}
					</span>
				) : (
					<span key={index}>{part.value}</span>
				),
			)}
		</p>
	);
}
