import { useCallback, useEffect, useState } from 'react';
import { MapPin, LocateFixed, Save, Radio } from 'lucide-react';
import { toast } from 'sonner';
import pb from '@/lib/pocketbase-client';
import type { Company } from '@/lib/accounting';
import {
	DEFAULT_GEOFENCE_RADIUS,
	ensureAttendanceSettings,
	getAttendanceSettings,
	saveAttendanceSettings,
	type AttendanceSettings,
} from '@/lib/attendance-settings';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/hooks/use-language';

interface GeofenceSettingsPanelProps {
	company: Company;
}

export function GeofenceSettingsPanel({ company }: GeofenceSettingsPanelProps) {
	const { t } = useLanguage();
	const ownerId = pb.authStore.record?.id ?? company.owner;
	const [settings, setSettings] = useState<AttendanceSettings | null>(null);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [locating, setLocating] = useState(false);

	const [enabled, setEnabled] = useState(false);
	const [lat, setLat] = useState<string>('');
	const [lng, setLng] = useState<string>('');
	const [radius, setRadius] = useState<string>(String(DEFAULT_GEOFENCE_RADIUS));

	const refresh = useCallback(async () => {
		setLoading(true);
		try {
			const s = await getAttendanceSettings(company.id);
			setSettings(s);
			setEnabled(Boolean(s?.geofence_enabled));
			setLat(s?.work_latitude ? String(s.work_latitude) : '');
			setLng(s?.work_longitude ? String(s.work_longitude) : '');
			setRadius(String(s?.geofence_radius || DEFAULT_GEOFENCE_RADIUS));
		} catch {
			setSettings(null);
		} finally {
			setLoading(false);
		}
	}, [company.id]);

	useEffect(() => {
		refresh().catch(() => {});
	}, [refresh]);

	const useMyLocation = () => {
		if (typeof navigator === 'undefined' || !navigator.geolocation) {
			toast.error(t('geofence.geo_unavailable'));
			return;
		}
		setLocating(true);
		navigator.geolocation.getCurrentPosition(
			pos => {
				setLat(pos.coords.latitude.toFixed(6));
				setLng(pos.coords.longitude.toFixed(6));
				setLocating(false);
				toast.success(t('geofence.loc_detected'));
			},
			err => {
				setLocating(false);
				if (err.code === err.PERMISSION_DENIED) {
					toast.error(t('geofence.geo_denied'));
				} else {
					toast.error(t('geofence.geo_failed'));
				}
			},
			{ enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
		);
	};

	const submit = async (e: React.FormEvent) => {
		e.preventDefault();
		const latNum = Number(lat);
		const lngNum = Number(lng);
		const radiusNum = Number(radius);

		if (enabled) {
			if (!lat || !lng || Number.isNaN(latNum) || Number.isNaN(lngNum)) {
				toast.error(t('geofence.coords_required'));
				return;
			}
			if (latNum < -90 || latNum > 90 || lngNum < -180 || lngNum > 180) {
				toast.error(t('geofence.coords_invalid'));
				return;
			}
		}
		if (!radius || Number.isNaN(radiusNum) || radiusNum < 1) {
			toast.error(t('geofence.radius_min'));
			return;
		}

		setSaving(true);
		try {
			const base = settings?.id
				? settings
				: await ensureAttendanceSettings(company.id, ownerId, {
						geofence_enabled: enabled,
						work_latitude: latNum,
						work_longitude: lngNum,
						geofence_radius: radiusNum,
					});
			const updated = await saveAttendanceSettings(base.id, {
				geofence_enabled: enabled,
				work_latitude: latNum || 0,
				work_longitude: lngNum || 0,
				geofence_radius: radiusNum,
			});
			setSettings(updated);
			toast.success(t('geofence.saved'));
		} catch {
			toast.error(t('geofence.save_failed'));
		} finally {
			setSaving(false);
		}
	};

	if (loading) {
		return (
			<div className="px-5 py-8">
				<p className="text-sm text-slate-500">{t('geofence.loading')}</p>
			</div>
		);
	}

	return (
		<div className="px-5 py-6">
			<form
				onSubmit={submit}
				className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
			>
				<div className="flex items-center gap-2">
					<div className="flex size-9 items-center justify-center rounded-lg bg-emerald-50">
						<Radio className="size-5 text-emerald-600" />
					</div>
					<div>
						<h2 className="text-lg font-bold text-slate-900">{t('geofence.title')}</h2>
						<p className="text-xs text-slate-500">
							{t('geofence.desc')}
						</p>
					</div>
				</div>

				<label className="mt-5 flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
					<span className="text-sm font-medium text-slate-700">
						{t('geofence.enable')}
						<span className="block text-xs font-normal text-slate-500">
							{t('geofence.enable_hint')}
						</span>
					</span>
					<input
						type="checkbox"
						checked={enabled}
						onChange={e => setEnabled(e.target.checked)}
						className="size-5 accent-emerald-600"
					/>
				</label>

				<div className={cn('mt-4 space-y-4', !enabled && 'opacity-60')}>
					<div className="grid gap-3 sm:grid-cols-2">
						<label className="block text-sm">
							<span className="mb-1.5 block font-medium text-slate-700">{t('geofence.lat')}</span>
							<input
								type="number"
								step="any"
								disabled={!enabled}
								value={lat}
								onChange={e => setLat(e.target.value)}
								placeholder="-6.2088"
								className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm disabled:bg-slate-50"
							/>
						</label>
						<label className="block text-sm">
							<span className="mb-1.5 block font-medium text-slate-700">{t('geofence.lng')}</span>
							<input
								type="number"
								step="any"
								disabled={!enabled}
								value={lng}
								onChange={e => setLng(e.target.value)}
								placeholder="106.8456"
								className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm disabled:bg-slate-50"
							/>
						</label>
					</div>

					<button
						type="button"
						onClick={useMyLocation}
						disabled={!enabled || locating}
						className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 disabled:opacity-50"
					>
						<LocateFixed className="size-4" />
						{locating ? t('geofence.locating') : t('geofence.use_location')}
					</button>

					<label className="block text-sm">
						<span className="mb-1.5 block font-medium text-slate-700">{t('geofence.radius')}</span>
						<input
							type="number"
							min={1}
							value={radius}
							onChange={e => setRadius(e.target.value)}
							className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
						/>
						<span className="mt-1 block text-xs text-slate-500">
							{t('geofence.radius_hint')}
						</span>
					</label>
				</div>

				<div className="mt-5 flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2.5 text-xs text-slate-500">
					<MapPin className="mt-0.5 size-3.5 shrink-0 text-slate-400" />
					{t('geofence.note')}{' '}
					<span className="font-semibold text-slate-600">{company.name}</span>.
				</div>

				<div className="mt-5 flex justify-end">
					<button
						type="submit"
						disabled={saving}
						className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-60"
					>
						<Save className="size-4" />
						{saving ? t('company.saving') : t('geofence.save')}
					</button>
				</div>
			</form>
		</div>
	);
}
