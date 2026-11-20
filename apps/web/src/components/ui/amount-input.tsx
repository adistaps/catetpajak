import { useEffect, useRef, useState } from 'react';

interface AmountInputProps
	extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
	/** Nilai numerik yang disimpan (angka mentah, tanpa pemisah). */
	value: number | string;
	/** Dipanggil dengan nilai numerik mentah setiap kali input berubah. */
	onValueChange: (value: number) => void;
}

/** Ambil hanya digit dari sembarang teks. */
function toDigits(text: string): string {
	return text.replace(/\D/g, '');
}

/** Format digit mentah menjadi string berpemisah ribuan titik, mis. "2000000" → "2.000.000". */
function formatGrouped(digits: string): string {
	if (!digits) return '';
	return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/**
 * Input nominal rupiah yang memformat angka dengan pemisah ribuan titik secara
 * otomatis saat diketik. Nilai yang disimpan tetap berupa angka mentah
 * (number), sehingga perhitungan tidak terpengaruh.
 *
 * Contoh: mengetik `2000000` menampilkan `2.000.000`.
 */
export function AmountInput({
	value,
	onValueChange,
	className,
	placeholder,
	...rest
}: AmountInputProps) {
	const [display, setDisplay] = useState(() =>
		formatGrouped(toDigits(String(value ?? ''))),
	);
	const focused = useRef(false);

	// Sinkronkan tampilan saat nilai berubah dari luar (bukan saat sedang fokus).
	useEffect(() => {
		if (focused.current) return;
		setDisplay(formatGrouped(toDigits(String(value ?? ''))));
	}, [value]);

	const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
		const digits = toDigits(event.target.value);
		setDisplay(formatGrouped(digits));
		onValueChange(digits ? Number(digits) : 0);
	};

	return (
		<input
			type="text"
			inputMode="numeric"
			value={display}
			onChange={handleChange}
			onFocus={() => {
				focused.current = true;
			}}
			onBlur={() => {
				focused.current = false;
				setDisplay(formatGrouped(toDigits(String(value ?? ''))));
			}}
			className={className}
			placeholder={placeholder ?? '0'}
			{...rest}
		/>
	);
}
