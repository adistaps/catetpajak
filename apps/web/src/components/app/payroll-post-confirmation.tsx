import { CheckCircle2 } from 'lucide-react';
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { formatRupiah } from '@/lib/accounting';

interface PayrollPostConfirmationProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onConfirm: () => void;
	period: string;
	gross: number;
	otherDeductions?: number;
	otherAccountName?: string;
	loanInterest?: number;
	loanInterestAccountName?: string;
}

export function PayrollPostConfirmation({ open, onOpenChange, onConfirm, period, gross, otherDeductions = 0, otherAccountName, loanInterest = 0, loanInterestAccountName }: PayrollPostConfirmationProps) {
	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent className="w-[calc(100%-2rem)] max-w-md gap-0 rounded-2xl border-border bg-card p-6 shadow-xl sm:p-7">
				<AlertDialogHeader className="space-y-3 text-left">
					<div className="flex size-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
						<CheckCircle2 className="size-5" aria-hidden="true" />
					</div>
					<AlertDialogTitle className="text-lg font-bold text-foreground">Konfirmasi penerbitan jurnal</AlertDialogTitle>
					<AlertDialogDescription className="text-sm leading-relaxed text-muted-foreground">
						Terbitkan jurnal penggajian {period}? Bruto {formatRupiah(gross)}.
						{otherDeductions > 0 ? ` Potongan komponen lain ${formatRupiah(otherDeductions)} akan dikreditkan ke akun ${otherAccountName || 'yang dipilih'}.` : ''}
						{loanInterest > 0 ? ` Bunga pinjaman ${formatRupiah(loanInterest)} akan dikreditkan ke akun ${loanInterestAccountName || 'yang dipilih'}.` : ''}
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter className="mt-7 gap-2 sm:space-x-0">
					<AlertDialogCancel className="mt-0 rounded-full border-primary/40 px-5 font-semibold text-primary hover:bg-primary/10 hover:text-primary">Batal</AlertDialogCancel>
					<AlertDialogAction onClick={onConfirm} className="rounded-full bg-primary px-6 font-semibold text-primary-foreground hover:bg-primary/90">OK</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
