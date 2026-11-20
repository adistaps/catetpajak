import { NavLink } from 'react-router';
import { Calculator, FileText, Layers, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/hooks/use-language';

const TABS = [
	{ to: '/app/pajak', labelKey: 'tax.tab.withholding', icon: FileText, end: true },
	{ to: '/app/pajak/simulasi', labelKey: 'tax.tab.simulation', icon: Calculator, end: false },
	{ to: '/app/pajak/unifikasi', labelKey: 'tax.tab.unifikasi', icon: Layers, end: false },
	{ to: '/app/pajak/pengaturan', labelKey: 'tax.tab.settings', icon: Settings, end: false },
];

export function PajakTabs() {
	const { t } = useLanguage();
	return (
		<nav aria-label="Menu pajak" className="flex w-full shrink-0 flex-col gap-1 bg-transparent py-1 lg:sticky lg:top-4 lg:w-64">
			{TABS.map(tab => (
				<NavLink
					key={tab.to}
					to={tab.to}
					end={tab.end}
					className={({ isActive }) =>
						cn(
							'relative flex w-full items-center gap-3.5 border-l-[3px] px-4 py-3.5 text-left text-[15px] font-semibold leading-snug transition-colors',
							isActive
								? 'border-emerald-600 bg-emerald-50 text-emerald-600'
								: 'border-transparent text-[#5f7d72] hover:bg-emerald-50/60 hover:text-emerald-700',
						)
					}
				>
					<tab.icon className="size-5 shrink-0" strokeWidth={1.75} />
					<span>{t(tab.labelKey)}</span>
				</NavLink>
			))}
		</nav>
	);
} 
