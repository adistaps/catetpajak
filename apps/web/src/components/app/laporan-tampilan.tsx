import { useMemo, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { AccountBalance } from '@/lib/accounting';

/** Komponen presentasi bersama untuk daftar laporan; tidak mengubah saldo sumber. */
export function FinancialTable({ children, amountLabel = 'Saldo (IDR)' }: { children: ReactNode; amountLabel?: string }) {
	return (
		<div className="financial-table-wrap">
			<table className="financial-table">
				<thead>
					<tr>
						<th scope="col">Akun / uraian</th>
						<th scope="col">{amountLabel}</th>
					</tr>
				</thead>
				<tbody>{children}</tbody>
			</table>
		</div>
	);
}

export function FinancialRow({
	label,
	value,
	bold = false,
	depth = 0,
}: {
	label: ReactNode;
	value?: ReactNode;
	bold?: boolean;
	depth?: number;
}) {
	return (
		<tr className={bold ? 'financial-row financial-row-strong' : 'financial-row'}>
			<td style={{ paddingLeft: `${20 + depth * 24}px` }}>{label}</td>
			<td className="financial-amount">{value}</td>
		</tr>
	);
}

export function FinancialGroup({
	label,
	value,
	children,
	depth = 0,
}: {
	label: string;
	value?: ReactNode;
	children: ReactNode;
	depth?: number;
}) {
	const [open, setOpen] = useState(true);
	return (
		<>
			<tr className="financial-row financial-row-group">
				<td style={{ paddingLeft: `${20 + depth * 24}px` }}>
					<button type="button" className="financial-group-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
						{open ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}
						<span>{label}</span>
					</button>
				</td>
				<td className="financial-amount">{value}</td>
			</tr>
			{open ? children : null}
		</>
	);
}

type AccountNode = {
	row: AccountBalance;
	own: number | null;
	children: AccountNode[];
};

/**
 * Induk hanya dipakai sebagai struktur tampilan. Jumlahnya adalah saldo akun
 * yang benar-benar termasuk dalam daftar ditambah keturunannya, sekali saja.
 */
function makeAccountTree(rows: AccountBalance[], context: AccountBalance[]): AccountNode[] {
	const available = new Map(context.map(row => [row.account.id, row]));
	const nodes = new Map<string, AccountNode>();
	const add = (row: AccountBalance) => {
		let node = nodes.get(row.account.id);
		if (!node) {
			node = { row, own: null, children: [] };
			nodes.set(row.account.id, node);
		}
		return node;
	};
	for (const row of rows) {
		add(row).own = row.balance;
		const seen = new Set([row.account.id]);
		let current = row;
		while (current.account.parent) {
			const parent = available.get(current.account.parent);
			if (!parent || parent.account.type !== row.account.type || seen.has(parent.account.id)) break;
			seen.add(parent.account.id);
			add(parent);
			current = parent;
		}
	}
	const roots: AccountNode[] = [];
	for (const node of nodes.values()) {
		const parentId = node.row.account.parent;
		const parent = parentId ? nodes.get(parentId) : undefined;
		// Abaikan hubungan melingkar agar semua akun tetap dapat ditampilkan.
		let cursor = parent;
		const seen = new Set([node.row.account.id]);
		let cyclic = false;
		while (cursor) {
			if (seen.has(cursor.row.account.id)) {
				cyclic = true;
				break;
			}
			seen.add(cursor.row.account.id);
			cursor = cursor.row.account.parent ? nodes.get(cursor.row.account.parent) : undefined;
		}
		if (parent && !cyclic) parent.children.push(node);
		else roots.push(node);
	}
	const sortNodes = (items: AccountNode[]) => {
		items.sort((a, b) => a.row.account.code.localeCompare(b.row.account.code, 'id', { numeric: true }));
		items.forEach(item => sortNodes(item.children));
	};
	sortNodes(roots);
	return roots;
}

function nodeTotal(node: AccountNode): number {
	return (node.own ?? 0) + node.children.reduce((total, child) => total + nodeTotal(child), 0);
}

function AccountTreeNode({ node, depth, format }: { node: AccountNode; depth: number; format: (value: number) => string }) {
	const { account } = node.row;
	const label = `${account.code} ${account.name}`.trim();
	if (node.children.length === 0) {
		return <FinancialRow label={label} value={format(node.own ?? 0)} depth={depth} />;
	}
	const includesOwnValue = node.own !== null && node.own !== 0;
	const groupLabel = includesOwnValue ? `${label} (termasuk saldo akun)` : label;
	return (
		<FinancialGroup label={groupLabel} value={format(nodeTotal(node))} depth={depth}>
			{includesOwnValue && node.own !== null ? (
				<FinancialRow label={`Saldo akun ${account.code}`} value={format(node.own)} depth={depth + 1} />
			) : null}
			{node.children.map(child => <AccountTreeNode key={child.row.account.id} node={child} depth={depth + 1} format={format} />)}
		</FinancialGroup>
	);
}

export function FinancialAccountRows({
	rows,
	context,
	format,
	depth = 1,
}: {
	rows: AccountBalance[];
	context: AccountBalance[];
	format: (value: number) => string;
	depth?: number;
}) {
	const tree = useMemo(() => makeAccountTree(rows, context), [rows, context]);
	if (tree.length === 0) return null;
	return <>{tree.map(node => <AccountTreeNode key={node.row.account.id} node={node} depth={depth} format={format} />)}</>;
}
