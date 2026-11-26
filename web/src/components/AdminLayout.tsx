import { type ReactNode, useEffect, useState } from 'react';
import { EphemeralNotice } from './EphemeralNotice';
import { Icon } from './Icon';
import { Logo } from './Logo';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../auth';
import { useI18n } from '../i18n';
import { roleKeys } from '../labels';
import { LanguageSelect, ThemeToggle } from './Controls';
import { AlertsBanner } from '../features/alerts/AlertsBanner';
import { AlertsProvider, useAlerts } from '../features/alerts/AlertsProvider';

interface NavItem {
  to: string;
  key: string;
  icon: string;
  adminOnly?: boolean;
  group: 'ops' | 'watch' | 'resources' | 'admin';
  /** Pastel tile colour on the "More" sheet. */
  tint: string;
  /** Shows the number of unclaimed driver alerts. */
  alertsBadge?: boolean;
}

const NAV: NavItem[] = [
  { group: 'ops', to: '/', key: 'nav.dashboard', icon: 'grid', tint: 'sky' },
  { group: 'ops', to: '/trips', key: 'nav.calendar', icon: 'calendar', tint: 'lilac' },
  { group: 'ops', to: '/trips-list', key: 'nav.tripsList', icon: 'list', tint: 'sage' },
  { group: 'ops', to: '/map', key: 'nav.map', icon: 'map', tint: 'butter' },
  { group: 'watch', to: '/alerts', key: 'nav.alerts', alertsBadge: true, icon: 'alert', tint: 'rose' },
  { group: 'watch', to: '/tracking', key: 'nav.tracking', icon: 'pin', tint: 'peach' },
  { group: 'resources', to: '/drivers', key: 'nav.drivers', icon: 'user', tint: 'sky' },
  { group: 'resources', to: '/vehicles', key: 'nav.vehicles', icon: 'car', tint: 'sage' },
  { group: 'resources', to: '/maintenance', key: 'nav.maintenance', icon: 'wrench', tint: 'butter' },
  { group: 'admin', to: '/admin', key: 'nav.admin', icon: 'shield', tint: 'lilac', adminOnly: true },
];

/** The five places reachable with one thumb from the floating bar; everything else is under "More". */
const DOCK_PATHS = ['/', '/trips', '/map', '/tracking'];

export function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <AlertsProvider>
      <LayoutInner>{children}</LayoutInner>
    </AlertsProvider>
  );
}

function Badge({ className = '' }: { className?: string }) {
  const { openCount } = useAlerts();
  if (!openCount) return null;
  return (
    <span className={`grid h-5 min-w-5 place-items-center rounded-full bg-red-500 px-1.5 text-[11px] font-semibold text-white ${className}`} data-testid="alerts-badge">
      {openCount}
    </span>
  );
}

function LayoutInner({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const { t } = useI18n();
  const { openCount } = useAlerts();
  const [more, setMore] = useState(false);
  const location = useLocation();
  useEffect(() => setMore(false), [location.pathname]);
  const items = NAV.filter((n) => !n.adminOnly || user?.role === 'ADMIN');
  const dock = DOCK_PATHS.map((p) => items.find((i) => i.to === p)).filter((i): i is NavItem => !!i);
  // The clinic name / language / theme bar is only on the home page: every other screen gets the full height.
  const isHome = location.pathname === '/';
  const moreActive = !dock.some((d) => (d.to === '/' ? location.pathname === '/' : location.pathname.startsWith(d.to)));

  const linkClass = (isActive: boolean) =>
    `group relative flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-[14px] font-medium transition ${
      isActive
        ? 'bg-brand-600 text-white shadow-md'
        : 'text-[var(--sidebar-fg)] hover:bg-surface2'
    }`;
  const sections = (['ops', 'watch', 'resources', 'admin'] as const)
    .map((g) => ({ g, list: items.filter((n) => n.group === g) }))
    .filter((x) => x.list.length > 0);

  return (
    <div className="min-h-full">
      {/* Desktop: a floating, frosted panel with room around it (not glued to the screen edge). */}
      <aside className="glass shadow-float fixed inset-y-3 start-3 z-30 hidden w-64 flex-col rounded-[28px] md:flex" data-testid="sidebar">
        <div className="px-6 pb-2 pt-6" dir="ltr">
          <Logo className="h-9 w-auto" />
        </div>
        <p className="px-6 pb-1 text-[11px] font-medium tracking-wide text-[var(--sidebar-muted)]">{t('common.app')}</p>

        <nav className="flex-1 overflow-y-auto px-3 pb-3">
          {sections.map(({ g, list }) => (
            <div key={g}>
              <p className="px-3.5 pb-1.5 pt-5 text-[11px] font-medium tracking-wide text-[var(--sidebar-muted)]">{t(`nav.group.${g}`)}</p>
              <div className="space-y-1">
                {list.map((item) => (
                  <NavLink key={item.to} to={item.to} end={item.to === '/'} className={({ isActive }) => linkClass(isActive)}>
                    <Icon name={item.icon} className="h-[18px] w-[18px]" />
                    <span className="truncate">{t(item.key)}</span>
                    {item.alertsBadge && <Badge className="ms-auto" />}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="m-3 flex items-center gap-3 rounded-2xl bg-surface p-2.5 shadow-md">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent-soft text-sm font-semibold text-accent-soft-fg">
            {user?.name?.charAt(0) ?? '?'}
          </div>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-sm font-medium text-fg">{user?.name}</p>
            <p className="truncate text-xs text-muted">{user ? t(roleKeys[user.role]) : ''}</p>
          </div>
          <button
            onClick={logout}
            title={t('common.logout')}
            aria-label={t('common.logout')}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted transition hover:bg-surface2 hover:text-fg"
          >
            <Icon name="logout" className="h-[18px] w-[18px]" />
          </button>
        </div>
      </aside>

      <div className="flex min-h-full flex-col md:ps-[17.5rem]">
        {isHome && (
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 bg-[color-mix(in_srgb,var(--bg)_72%,transparent)] px-4 backdrop-blur-xl md:px-6">
          <div className="md:hidden" dir="ltr">
            <Logo className="h-7 w-auto" />
          </div>
          <div className="hidden text-sm text-muted md:block">{t('nav.subtitle')}</div>
          <div className="flex items-center gap-2">
            <LanguageSelect />
            <ThemeToggle />
          </div>
        </header>
        )}

        <AlertsBanner />

        <main className="flex-1 p-4 pb-28 md:p-6 md:pb-6">
          <EphemeralNotice />
          {children}
        </main>
      </div>

      {/* Phone: a floating bar over the content, like a dock. Four places plus "More". */}
      <nav
        className="shadow-float fixed inset-x-4 bottom-4 z-40 flex items-center justify-between rounded-[30px] bg-[var(--dock-bg)] p-1.5 backdrop-blur-xl md:hidden"
        data-testid="dock"
      >
        {dock.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            aria-label={t(item.key)}
            className={({ isActive }) =>
              `flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-[24px] px-1 py-2 text-[10.5px] font-medium transition ${
                isActive ? 'bg-[var(--dock-active-bg)] text-[var(--dock-active-fg)] shadow-md' : 'text-[var(--dock-fg)]'
              }`
            }
          >
            <Icon name={item.icon} className="h-[21px] w-[21px]" />
            <span className="max-w-full truncate">{t(`nav.short.${item.to}`)}</span>
          </NavLink>
        ))}
        <button
          type="button"
          onClick={() => setMore(true)}
          data-testid="dock-more"
          aria-label={t('common.more')}
          className={`relative flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-[24px] px-1 py-2 text-[10.5px] font-medium transition ${
            moreActive ? 'bg-[var(--dock-active-bg)] text-[var(--dock-active-fg)] shadow-md' : 'text-[var(--dock-fg)]'
          }`}
        >
          <Icon name="dots" className="h-[21px] w-[21px]" />
          <span>{t('common.more')}</span>
          {openCount > 0 && <span className="absolute end-3 top-1.5 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-[var(--dock-bg)]" />}
        </button>
      </nav>

      {more && (
        <div className="fixed inset-0 z-50 md:hidden" onClick={() => setMore(false)} data-testid="more-sheet">
          <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" />
          <div
            className="absolute inset-x-3 bottom-3 rounded-[32px] bg-surface p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border" />
            <div className="grid grid-cols-3 gap-3">
              {items
                .filter((i) => !dock.includes(i))
                .map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className="relative flex flex-col items-center gap-2 rounded-3xl p-3 text-center text-xs font-medium text-fg transition active:scale-95"
                    style={{ background: `var(--tint-${item.tint})` }}
                  >
                    <span className="grid h-11 w-11 place-items-center rounded-2xl bg-surface/80 shadow-sm">
                      <Icon name={item.icon} className="h-5 w-5" />
                    </span>
                    {t(item.key)}
                    {item.alertsBadge && <Badge className="absolute end-2 top-2" />}
                  </NavLink>
                ))}
            </div>
            <div className="mt-4 flex items-center gap-3 rounded-3xl bg-surface2 p-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent-soft text-sm font-semibold text-accent-soft-fg">
                {user?.name?.charAt(0) ?? '?'}
              </div>
              <div className="min-w-0 flex-1 leading-tight">
                <p className="truncate text-sm font-medium text-fg">{user?.name}</p>
                <p className="truncate text-xs text-muted">{user ? t(roleKeys[user.role]) : ''}</p>
              </div>
              <button onClick={logout} className="rounded-full bg-surface px-4 py-2 text-sm font-medium text-fg shadow-md">
                {t('common.logout')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
