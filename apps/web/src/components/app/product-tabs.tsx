import { NavLink } from 'react-router';
import { cn } from '@/lib/utils';

const TABS = [
	{ to: '/app/produk', label: 'Produk', end: true },
	{ to: '/app/produk/gudang', label: 'Gudang', end: false },
	{ to: '/app/produk/opname', label: 'Stock Opname', end: false },
	{ to: '/app/produk/transfer', label: 'Transfer', end: false },
];

export function ProductTabs() {
	return (
		<nav
			aria-label="Menu produk"
			className="flex w-full overflow-x-auto rounded-full border border-emerald-200/80 bg-[#eef1f6]"
		>
			{TABS.map((tab, index) => {
				const edge = index === 0 ? 'rounded-l-full' : index === TABS.length - 1 ? 'rounded-r-full' : '';
				return (
					<NavLink
						key={tab.to}
						to={tab.to}
						end={tab.end}
						className={({ isActive }) =>
							cn(
								'inline-flex min-h-11 min-w-max flex-1 items-center justify-center whitespace-nowrap px-4 py-2.5 text-sm font-semibold transition-colors',
								edge,
								isActive
									? 'bg-[#d8f5e4] text-emerald-800'
									: 'text-slate-700 hover:bg-[#eadcf8] hover:text-[#6b21a8]',
							)
						}
					>
						{tab.label}
					</NavLink>
				);
			})}
		</nav>
	);
}
