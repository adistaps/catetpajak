import { FileCheck2 } from 'lucide-react';
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

interface PayrollPayslipConfirmationProps {
	open: boolean;
	count: number;
	period: string;
	onOpenChange: (open: boolean) => void;
	onConfirm: () => void;
}

export function PayrollPayslipConfirmation({ open, count, period, onOpenChange, onConfirm }: PayrollPayslipConfirmationProps) {
	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent className="w-[calc(100%-2rem)] max-w-md gap-0 rounded-2xl border-border bg-card p-6 shadow-xl sm:p-7">
				<AlertDialogHeader className="space-y-3 text-left">
					<div className="flex size-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
						<FileCheck2 className="size-5" aria-hidden="true" />
					</div>
					<AlertDialogTitle className="text-lg font-bold text-foreground">Konfirmasi penerbitan payslip</AlertDialogTitle>
					<AlertDialogDescription className="text-sm leading-relaxed text-muted-foreground">
						Terbitkan {count} payslip terpilih untuk periode {period} ke aplikasi karyawan?
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter className="mt-7 gap-2 sm:space-x-0">
					<AlertDialogCancel className="mt-0 min-h-10 rounded-full border-primary/40 px-5 font-semibold text-primary hover:bg-primary/10 hover:text-primary">Batal</AlertDialogCancel>
					<AlertDialogAction onClick={onConfirm} className="min-h-10 rounded-full bg-primary px-6 font-semibold text-primary-foreground hover:bg-primary/90">Terbitkan payslip</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
