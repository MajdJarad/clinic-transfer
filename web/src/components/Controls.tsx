import { useI18n } from '../i18n';
import { LOCALES, type Locale } from '../i18n/translations';
import { useTheme } from '../theme';

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  );
}

export function ThemeToggle({ className = '' }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const { t } = useI18n();
  const label = theme === 'dark' ? t('common.light') : t('common.dark');
  return (
    <button
      type="button"
      onClick={toggle}
      title={label}
      aria-label={label}
      className={`grid h-10 w-10 place-items-center rounded-full bg-surface text-muted shadow-md transition hover:text-fg active:scale-95 ${className}`}
    >
      {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

export function LanguageSelect({ className = '' }: { className?: string }) {
  const { locale, setLocale, t } = useI18n();
  return (
    <select
      value={locale}
      onChange={(e) => setLocale(e.target.value as Locale)}
      aria-label={t('common.language')}
      className={`h-10 rounded-full bg-surface px-3 text-sm text-fg shadow-md outline-none focus:ring-4 focus:ring-[color-mix(in_srgb,var(--ring)_16%,transparent)] ${className}`}
    >
      {LOCALES.map((l) => (
        <option key={l.code} value={l.code}>
          {l.label}
        </option>
      ))}
    </select>
  );
}
