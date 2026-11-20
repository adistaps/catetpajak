import pb from '@/lib/pocketbase-client';

export interface AttendanceSettings {
	id: string;
	company: string;
	geofence_enabled: boolean;
	work_latitude: number;
	work_longitude: number;
	geofence_radius: number;
	owner: string;
	created: string;
	updated: string;
}

/** Sensible default radius (meters) for a new geofence config. */
export const DEFAULT_GEOFENCE_RADIUS = 100;

/**
 * Load the attendance geofence settings for a company. Returns `null` when no
 * row exists yet (geofence enforcement off by default).
 */
export async function getAttendanceSettings(
	companyId: string,
): Promise<AttendanceSettings | null> {
	const list = await pb
		.collection('attendance_settings')
		.getFullList<AttendanceSettings>({
			filter: pb.filter('company = {:company}', { company: companyId }),
			requestKey: null,
		});
	return list[0] ?? null;
}

/**
 * Get-or-create the settings row for a company. Used by the admin panel when
 * saving — ensures a single row per company (unique index backs it).
 */
export async function ensureAttendanceSettings(
	companyId: string,
	ownerId: string,
	defaults: Partial<AttendanceSettings> = {},
): Promise<AttendanceSettings> {
	const existing = await getAttendanceSettings(companyId);
	if (existing) return existing;

	const created = await pb.collection('attendance_settings').create<AttendanceSettings>({
		company: companyId,
		geofence_enabled: defaults.geofence_enabled ?? false,
		work_latitude: defaults.work_latitude ?? 0,
		work_longitude: defaults.work_longitude ?? 0,
		geofence_radius: defaults.geofence_radius ?? DEFAULT_GEOFENCE_RADIUS,
		owner: ownerId,
	});
	return created;
}

export async function saveAttendanceSettings(
	id: string,
	patch: Partial<AttendanceSettings>,
): Promise<AttendanceSettings> {
	return pb.collection('attendance_settings').update<AttendanceSettings>(id, patch);
}

/**
 * Haversine distance in meters between two lat/lng points.
 */
export function haversineMeters(
	lat1: number,
	lng1: number,
	lat2: number,
	lng2: number,
): number {
	const R = 6371000; // earth radius (m)
	const toRad = (deg: number) => (deg * Math.PI) / 180;
	const dLat = toRad(lat2 - lat1);
	const dLng = toRad(lng2 - lng1);
	const a =
		Math.sin(dLat / 2) * Math.sin(dLat / 2) +
		Math.cos(toRad(lat1)) *
			Math.cos(toRad(lat2)) *
			Math.sin(dLng / 2) *
			Math.sin(dLng / 2);
	const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
	return R * c;
}

export type GeofenceProbeResult =
	| { ok: true; lat: number; lng: number; distance: number; radius: number }
	| { ok: false; reason: 'unavailable' | 'denied' | 'timeout' | 'unknown' };

/**
 * Request the browser geolocation once and resolve the distance to the work
 * location. Resolves `{ ok: false }` variants when the permission is denied or
 * geolocation is unavailable so the caller can show clear feedback.
 */
export function probeGeofence(
	workLat: number,
	workLng: number,
	radius: number,
): Promise<GeofenceProbeResult> {
	return new Promise(resolve => {
		if (typeof navigator === 'undefined' || !navigator.geolocation) {
			resolve({ ok: false, reason: 'unavailable' });
			return;
		}
		navigator.geolocation.getCurrentPosition(
			pos => {
				const lat = pos.coords.latitude;
				const lng = pos.coords.longitude;
				const distance = haversineMeters(lat, lng, workLat, workLng);
				resolve({ ok: true, lat, lng, distance, radius });
			},
			err => {
				if (err.code === err.PERMISSION_DENIED) {
					resolve({ ok: false, reason: 'denied' });
				} else if (err.code === err.TIMEOUT) {
					resolve({ ok: false, reason: 'timeout' });
				} else {
					resolve({ ok: false, reason: 'unknown' });
				}
			},
			{ enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
		);
	});
}
