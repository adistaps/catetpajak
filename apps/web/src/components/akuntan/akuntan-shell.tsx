import { Link, useNavigate } from 'react-router';
import { Compass, CreditCard, LogOut, UserRound } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { getAkuntanRole } from '@/lib/akuntan';
import { ShellPostButton } from '@/components/akuntan/shell-post-button';
import { openCookiePreferences } from '@/lib/cookie-consent';
const LOGO = '/catet-logo.png';

/**
 * Chrome aplikasi direktori Akuntan — terpisah dari header pemasaran dan
 * aplikasi akuntansi. Masuk/daftar selalu mengarah ke /akuntan/masuk.
 */
export function AkuntanShell({
  children
}: {
  children: React.ReactNode;
}) {
  const {
    user,
    isAuthed,
    isLoading,
    logout
  } = useAuth();
  const navigate = useNavigate();
  const role = getAkuntanRole(user);
  return <div className="min-h-dvh bg-[#f7fbf8] text-foreground">
			<header className="sticky top-0 z-30 border-b border-emerald-100/80 bg-white/90 backdrop-blur">
				<div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-5 md:px-8">
					<Link to="/akuntan" className="flex items-center gap-2.5">
						<img src={LOGO} alt="" className="brand-logo size-9 object-contain" />
						<span className="text-[17px] font-extrabold tracking-tight text-[#12315a]">
							Catet <span className="text-emerald-500">Akuntan</span>
						</span>
					</Link>
					<nav className="flex items-center gap-2">
						<Link to="/akuntan/activity" className="inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-[#12315a] hover:bg-emerald-50">
							<span className="hidden sm:inline">Activity</span>
						</Link>
						{isLoading ? <div className="h-9 w-24" /> : isAuthed ? <>
								{role === 'pencari' ? <>
									<Link to="/akuntan" className="inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-[#12315a] hover:bg-emerald-50">
										<Compass className="size-4" strokeWidth={1.75} />
										<span className="hidden sm:inline">Jelajah Direktori</span>
									</Link>
									<Link to="/akuntan/langganan" className="inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-[#12315a] hover:bg-emerald-50">
										<CreditCard className="size-4" strokeWidth={1.75} />
										<span className="hidden sm:inline">Langganan</span>
									</Link>
								</> : <>
										<Link to="/akuntan/profil-detail" className="inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-[#12315a] hover:bg-emerald-50"><UserRound className="size-4" strokeWidth={1.75} /><span className="hidden md:inline">Profile</span></Link>
									</>}
								<ShellPostButton />
								<button type="button" onClick={() => {
              logout();
              navigate('/akuntan');
            }} className="inline-flex h-10 items-center gap-1.5 rounded-full border border-emerald-200 px-3 text-sm font-semibold text-[#12315a] hover:bg-emerald-50">
									<LogOut className="size-4" strokeWidth={1.75} />
									Keluar
								</button>
							</> : <>
								<Link to="/akuntan/masuk" className="inline-flex h-10 items-center rounded-full px-3 text-sm font-semibold text-[#12315a] hover:bg-emerald-50">
									Masuk
								</Link>
								<Link to="/akuntan/masuk?mode=daftar" className="inline-flex h-10 items-center rounded-full bg-gradient-to-r from-[#0f3d32] to-emerald-600 px-4 text-sm font-semibold text-white shadow-soft-sm hover:brightness-110">
									Daftar
								</Link>
							</>}
					</nav>
				</div>
			</header>
			{children}
			<footer className="border-t border-emerald-100 bg-white">
				<div className="mx-auto flex max-w-6xl flex-col gap-2 px-5 py-8 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between md:px-8">
					<p>© 2026 Catet Akuntan. Direktori jasa akuntan Indonesia. <button type="button" onClick={openCookiePreferences} className="underline hover:text-primary">Pengaturan cookie</button></p>
					<Link to="/" className="font-medium text-[#12315a] hover:underline">
						Ke situs Catet Pajak
					</Link>
				</div>
			</footer>
		</div>;
}