import { useMemo, useRef, useState } from 'react';
import { AtSign } from 'lucide-react';
import {
	extractMentionQuery,
	insertMention,
	type MentionCandidate,
} from '@/lib/mentions';

const MAX_SUGGESTIONS = 5;

/**
 * Textarea dengan pemilih mention: ketik "@" lalu sebagian nama untuk melihat
 * kandidat pengguna yang relevan; pilih dengan klik atau tombol panah + Enter.
 * Mention disimpan sebagai teks @[Nama] dan tampil jelas setelah dipublikasikan.
 */
export function MentionTextarea({
	value,
	onChange,
	candidates,
	rows = 3,
	maxLength,
	placeholder,
	className,
	ariaLabel,
	popupPlacement = 'bottom',
}: {
	value: string;
	onChange: (value: string) => void;
	candidates: MentionCandidate[];
	rows?: number;
	maxLength?: number;
	placeholder?: string;
	className?: string;
	ariaLabel?: string;
	popupPlacement?: 'top' | 'bottom';
}) {
	const ref = useRef<HTMLTextAreaElement>(null);
	const [mention, setMention] = useState<{ query: string; start: number } | null>(null);
	const [highlight, setHighlight] = useState(0);

	const matches = useMemo(() => {
		if (!mention) return [];
		const needle = mention.query.trim().toLowerCase();
		return candidates
			.filter(candidate => candidate.name.toLowerCase().includes(needle))
			.slice(0, MAX_SUGGESTIONS);
	}, [mention, candidates]);

	function syncMention(text: string, caret: number) {
		setMention(extractMentionQuery(text, caret));
		setHighlight(0);
	}

	function pick(candidate: MentionCandidate) {
		if (!mention || !ref.current) return;
		const caret = ref.current.selectionStart ?? value.length;
		const next = insertMention(value, mention.start, caret, candidate.name);
		onChange(next.text);
		setMention(null);
		requestAnimationFrame(() => {
			ref.current?.focus();
			ref.current?.setSelectionRange(next.caret, next.caret);
		});
	}

	function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
		if (!mention || matches.length === 0) return;
		if (event.key === 'ArrowDown') {
			event.preventDefault();
			setHighlight(index => (index + 1) % matches.length);
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			setHighlight(index => (index - 1 + matches.length) % matches.length);
		} else if (event.key === 'Enter' || event.key === 'Tab') {
			event.preventDefault();
			pick(matches[highlight]);
		} else if (event.key === 'Escape') {
			setMention(null);
		}
	}

	return (
		<div className="relative w-full">
			<textarea
				ref={ref}
				value={value}
				rows={rows}
				maxLength={maxLength}
				placeholder={placeholder}
				aria-label={ariaLabel}
				className={className}
				onChange={event => {
					onChange(event.target.value);
					syncMention(event.target.value, event.target.selectionStart ?? 0);
				}}
				onKeyUp={event => syncMention(value, event.currentTarget.selectionStart ?? 0)}
				onClick={event => syncMention(value, event.currentTarget.selectionStart ?? 0)}
				onKeyDown={onKeyDown}
				onBlur={() => {
					window.setTimeout(() => setMention(null), 150);
				}}
			/>
			{mention && matches.length > 0 ? (
				<ul
					role="listbox"
					aria-label="Pengguna yang bisa disebut"
					className={`absolute left-0 z-30 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg ${
						popupPlacement === 'top' ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
					}`}
				>
					{matches.map((candidate, index) => (
						<li key={`${candidate.id}-${candidate.name}`}>
							<button
								type="button"
								role="option"
								aria-selected={index === highlight}
								onMouseDown={event => event.preventDefault()}
								onClick={() => pick(candidate)}
								className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${
									index === highlight
										? 'bg-emerald-50 font-semibold text-emerald-900'
										: 'text-slate-700'
								}`}
							>
								<AtSign className="size-3.5 shrink-0 text-emerald-600" />
								<span className="truncate">{candidate.name}</span>
							</button>
						</li>
					))}
				</ul>
			) : null}
		</div>
	);
}
