import { type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../auth';
import { useClinicName } from '../config';
import { useI18n } from '../i18n';
import { roleKeys } from '../labels';
import { LanguageSelect, ThemeToggle } from './Controls';

interface NavItem {
  to: string;
  key: string;
  icon: ReactNode;
  adminOnly?: boolean;
}

const icon = (path: ReactNode) => (
  <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {path}
  </svg>
);

const NAV: NavItem[] = [
  { to: '/', key: 'nav.dashboard', icon: icon(<><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></>) },
  { to: '/trips', key: 'nav.calendar', icon: icon(<><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M8 2v4M16 2v4" /></>) },
  { to: '/trips-list', key: 'nav.tripsList', icon: icon(<><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></>) },
  { to: '/map', key: 'nav.map', icon: icon(<><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" /><line x1="9" y1="3" x2="9" y2="18" /><line x1="15" y1="6" x2="15" y2="21" /></>) },
  { to: '/tracking', key: 'nav.tracking', icon: icon(<><path d="M12 21s-7-5.3-7-11a7 7 0 0 1 14 0c0 5.7-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></>) },
  { to: '/drivers', key: 'nav.drivers', icon: icon(<><circle cx="12" cy="8" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" /></>) },
  { to: '/vehicles', key: 'nav.vehicles', icon: icon(<><path d="M5 16l1.5-5A2 2 0 0 1 8.4 9.5h7.2a2 2 0 0 1 1.9 1.5L19 16" /><path d="M5 16h14v3H5z" /><circle cx="7.5" cy="19.5" r="1.5" /><circle cx="16.5" cy="19.5" r="1.5" /></>) },
  { to: '/maintenance', key: 'nav.maintenance', icon: icon(<path d="M14.7 6.3a3.5 3.5 0 0 1-4.6 4.6L5 16v3h3l5.1-5.1a3.5 3.5 0 0 1 4.6-4.6l-2.3 2.3 1.7 1.7 2.3-2.3a3.5 3.5 0 0 1-4.7-1.8z" />) },
  { to: '/admin', key: 'nav.admin', icon: icon(<><circle cx="12" cy="8" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" /><path d="M19 11l-2 2-2-2M19 11v4" /></>), adminOnly: true },
];

export function AdminLayout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const { t } = useI18n();
  const clinicName = useClinicName();
  const items = NAV.filter((n) => !n.adminOnly || user?.role === 'ADMIN');

  const linkClass = (isActive: boolean) =>
    `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
      isActive
        ? 'bg-accent-soft text-accent-soft-fg'
        : 'text-muted hover:bg-surface2 hover:text-fg'
    }`;

  return (
    <div className="min-h-full">
      <aside className="fixed inset-y-0 start-0 z-30 hidden w-64 flex-col border-e border-border bg-surface md:flex">
        <div className="flex items-center gap-3 border-b border-border px-5 py-5">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-lg font-bold text-white shadow-sm">
            {t('common.app').charAt(0)}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-fg">{t('common.app')}</p>
            <p className="truncate text-xs text-muted">{clinicName || t('common.clinic')}</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {items.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === '/'} className={({ isActive }) => linkClass(isActive)}>
              {item.icon}
              <span className="truncate">{t(item.key)}</span>
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-border p-3">
          <div className="mb-2 flex items-center gap-3 rounded-xl bg-surface2 px-3 py-2.5">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-600 text-sm font-bold text-white">
              {user?.name?.charAt(0) ?? '?'}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-fg">{user?.name}</p>
              <p className="truncate text-xs text-muted">{user ? t(roleKeys[user.role]) : ''}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="w-full rounded-xl px-3 py-2 text-start text-sm font-medium text-red-600 transition hover:bg-red-50 dark:hover:bg-red-500/10"
          >
            {t('common.logout')}
          </button>
        </div>
      </aside>

      <div className="flex min-h-full flex-col md:ps-64">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-border bg-surface/85 px-4 py-3 backdrop-blur md:px-6">
          <div className="flex items-center gap-2.5 md:hidden">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 text-sm font-bold text-white">
              {t('common.app').charAt(0)}
            </div>
            <span className="text-sm font-bold text-fg">{t('common.app')}</span>
          </div>
          <div className="hidden text-sm text-muted md:block">{t('nav.subtitle')}</div>
          <div className="flex items-center gap-2">
            <LanguageSelect />
            <ThemeToggle />
            <button
              onClick={logout}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-muted transition hover:bg-surface2 hover:text-fg md:hidden"
            >
              {t('common.logout')}
            </button>
          </div>
        </header>

        <nav className="flex gap-1 overflow-x-auto border-b border-border bg-surface px-2 py-2 md:hidden">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  isActive ? 'bg-accent-soft text-accent-soft-fg' : 'text-muted'
                }`
              }
            >
              {item.icon}
              {t(item.key)}
            </NavLink>
          ))}
        </nav>

        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
