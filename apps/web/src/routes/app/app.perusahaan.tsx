import { useOutletContext } from 'react-router';
import type { AppOutletContext } from '@/lib/app-context';
import { CompanyModule } from '@/components/app/company-module';

export default function AppPerusahaan() {
	const { companies, refreshCompanies, setActiveCompanyId, updateCompanyName } =
		useOutletContext<AppOutletContext>();

	return (
		<div className="flex flex-col gap-8">
			<header>
				<p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
					[ Database perusahaan ]
				</p>
				<h1 className="mt-2 text-3xl font-extrabold tracking-tight md:text-4xl">
					Perusahaan
				</h1>
				<p className="mt-1 text-sm text-muted-foreground">
					Setiap perusahaan baru otomatis mendapat bagan akun standar.
				</p>
			</header>
			<CompanyModule
				companies={companies}
				refreshCompanies={refreshCompanies}
				setActiveCompanyId={setActiveCompanyId}
				onCompanyNameUpdated={updateCompanyName}
			/>
		</div>
	);
}
