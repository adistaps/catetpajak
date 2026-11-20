import { useState } from 'react';
import { FileText } from 'lucide-react';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from '@/components/ui/dialog';
import { CvRequestForm } from '@/components/akuntan/cv-request-form';

/**
 * Tombol "Minta CV" pada kartu direktori: membuka dialog berisi formulir
 * permintaan CV untuk akuntan tersebut.
 */
export function CvRequestDialog({
	profile,
}: {
	profile: { id: string; name: string; cv_name: string };
}) {
	const [open, setOpen] = useState(false);

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<button
					type="button"
					className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-full border border-emerald-200 bg-white text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50 active:scale-[0.99]"
				>
					<FileText className="size-4" strokeWidth={1.75} />
					Minta CV
				</button>
			</DialogTrigger>
			<DialogContent className="max-h-[85dvh] overflow-y-auto rounded-2xl sm:max-w-lg">
				<DialogHeader>
					<DialogTitle className="text-left text-lg font-bold tracking-tight text-[#102a4c]">
						Minta Nama kepada {profile.name}
					</DialogTitle>
					<DialogDescription className="text-left text-sm leading-relaxed text-muted-foreground">
						Isi data Anda; {profile.cv_name} akan menerima permintaan nama dan dapat
						menghubungi Anda kembali.
					</DialogDescription>
				</DialogHeader>
				<CvRequestForm profile={profile} onSubmitted={() => undefined} />
			</DialogContent>
		</Dialog>
	);
}
