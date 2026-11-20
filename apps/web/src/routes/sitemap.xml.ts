import type { Route } from './+types/sitemap.xml';
import { siteOrigin } from '@/lib/site-origin.server';
import pocketbaseAdmin from '@/lib/pocketbase-client.server';
import { FEATURE_PAGES } from '@/data/feature-pages';
import { INDUSTRY_SOLUTIONS } from '@/data/industry-solutions';

type SitemapEntry = {
	path: string;
	lastmod?: string;
};

const STATIC_PATHS = ['/', '/login', '/plans', '/event', '/fitur', ...INDUSTRY_SOLUTIONS.map(item => `/solusi/${item.slug}`), '/akuntan', '/akuntan/masuk', '/akuntan/activity', '/app/parent', ...FEATURE_PAGES.map(page => `/fitur/${page.slug}`)];

function escapeXml(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&apos;');
}

function toLoc(origin: string, path: string): string {
	return `${origin}${path.startsWith('/') ? path : `/${path}`}`;
}

function serializeSitemap(origin: string, entries: SitemapEntry[]): string {
	const urls = entries
		.map(entry => {
			const loc = escapeXml(toLoc(origin, entry.path));
			const lastmod = entry.lastmod
				? `\n\t\t<lastmod>${escapeXml(entry.lastmod)}</lastmod>`
				: '';

			return `\t<url>\n\t\t<loc>${loc}</loc>${lastmod}\n\t</url>`;
		})
		.join('\n');

	return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

/**
 * Public dynamic URLs (blog posts, PDPs, articles).
 * Return `{ path, lastmod }` in the same change that adds a collection.
 * Return `[]` only while the site has no public records; clear those URLs
 * again in the same change that removes the collection.
 */
async function getDynamicEntries(): Promise<SitemapEntry[]> {
	try {
		const [profiles, posts] = await Promise.all([
			pocketbaseAdmin.listRecords<{ id: string; updated?: string; created?: string }>(
				'accountant_profiles',
				{ perPage: 500, fields: 'id,updated,created' },
			),
			pocketbaseAdmin.listRecords<{ id: string; updated?: string; created?: string }>(
				'accountant_posts',
				{ perPage: 500, fields: 'id,updated,created' },
			),
		]);
		return [
			...profiles.items.map(record => ({
				path: `/akuntan/profil/${record.id}`,
				lastmod: record.updated || record.created,
			})),
			...posts.items.map(record => ({
				path: `/akuntan/activity/${record.id}`,
				lastmod: record.updated || record.created,
			})),
		];
	} catch {
		return [];
	}
}

export async function loader({ request }: Route.LoaderArgs) {
	const origin = siteOrigin(request);
	const entries: SitemapEntry[] = [
		...STATIC_PATHS.map(path => ({ path })),
		...(await getDynamicEntries()),
	];

	return new Response(serializeSitemap(origin, entries), {
		headers: {
			'Content-Type': 'application/xml; charset=utf-8',
			'Cache-Control': 'public, max-age=3600',
		},
	});
}
