import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { useI18n } from '../i18n';

export function Spinner({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
    />
  );
}

export function Card({ children, className = '', 'data-testid': testId }: { children: ReactNode; className?: string; 'data-testid'?: string }) {
  return (
    <div className={`rounded-3xl border border-white/60 bg-surface shadow-card dark:border-white/5 ${className}`} data-testid={testId}>
      {children}
    </div>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="text-[17px] font-semibold text-fg">{children}</h2>
      {action}
    </div>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'success';
  size?: 'sm' | 'md';
  loading?: boolean;
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading,
  className = '',
  children,
  disabled,
  ...rest
}: ButtonProps) {
  const variants: Record<string, string> = {
    primary: 'bg-brand-600 text-white shadow-md hover:bg-brand-700 hover:shadow-lg active:scale-[0.98] disabled:bg-brand-300 dark:text-white',
    secondary: 'bg-surface text-fg border border-border shadow-sm hover:bg-surface2 active:scale-[0.98]',
    danger: 'bg-red-600 text-white shadow-md hover:bg-red-700 active:scale-[0.98]',
    success: 'bg-emerald-600 text-white shadow-md hover:bg-emerald-700 active:scale-[0.98]',
    ghost: 'bg-transparent text-muted hover:bg-surface2 hover:text-fg',
  };
  const sizes: Record<string, string> = {
    sm: 'px-3.5 py-1.5 text-sm',
    md: 'px-5 py-2.5 text-sm',
  };
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-full font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-fg/80">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted opacity-80">{hint}</span>}
    </label>
  );
}

const fieldClass =
  'w-full rounded-2xl border border-transparent bg-surface2 px-4 py-2.5 text-sm text-fg outline-none transition placeholder:text-muted/60 hover:bg-slate-100 focus:border-brand-500/40 focus:bg-surface focus:ring-4 focus:ring-[color-mix(in_srgb,var(--ring)_16%,transparent)] dark:hover:bg-slate-800';

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${fieldClass} ${props.className ?? ''}`} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${fieldClass} ${props.className ?? ''}`} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${fieldClass} ${props.className ?? ''}`} />;
}

export function Modal({
  open,
  title,
  onClose,
  children,
  wide,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const { t } = useI18n();
  // Esc closes the dialog.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  // Drawn on the page body: a dialog opened from inside a blurred / transformed bar (the driver's header) would
  // otherwise be sized and clipped by that bar instead of the screen.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/30 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className={`mt-10 w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} rounded-[28px] border border-white/60 bg-surface shadow-2xl dark:border-white/5`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 pb-1 pt-5">
          <h3 className="text-lg font-semibold text-fg">{title}</h3>
          <button
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-full bg-surface2 text-xl leading-none text-muted transition hover:text-fg"
            aria-label={t('common.close')}
          >
            ×
          </button>
        </div>
        <div className="p-6 pt-4">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

const statusColors: Record<string, string> = {
  green: 'bg-[var(--tint-sage)] text-emerald-700 dark:text-emerald-300',
  blue: 'bg-[var(--tint-sky)] text-sky-700 dark:text-sky-300',
  amber: 'bg-[var(--tint-butter)] text-amber-700 dark:text-amber-300',
  red: 'bg-[var(--tint-rose)] text-red-700 dark:text-red-300',
  slate: 'bg-surface2 text-muted',
  purple: 'bg-[var(--tint-lilac)] text-indigo-700 dark:text-indigo-300',
};

const statusTone: Record<string, keyof typeof statusColors> = {
  SCHEDULED: 'slate',
  ASSIGNED: 'blue',
  EN_ROUTE: 'amber',
  ARRIVED: 'purple',
  PICKED_UP: 'purple',
  COMPLETED: 'green',
  CANCELLED: 'red',
  AVAILABLE: 'green',
  ON_TRIP: 'amber',
  OFFLINE: 'slate',
  ACTIVE: 'green',
  MAINTENANCE: 'amber',
  OUT_OF_SERVICE: 'red',
  IN_PROGRESS: 'amber',
  DONE: 'green',
};

export function StatusPill({ status, label }: { status: string; label: string }) {
  const tone = statusColors[statusTone[status] ?? 'slate'];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${tone}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" aria-hidden />
      {label}
    </span>
  );
}

export function EmptyState({ text }: { text: string }) {
  return <div className="py-10 text-center text-sm text-muted">{text}</div>;
}

export function ErrorText({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return <p className="rounded-2xl bg-red-50 px-4 py-2.5 text-sm text-red-600 dark:bg-red-500/15 dark:text-red-300">{children}</p>;
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-[26px] font-semibold tracking-tight text-fg">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
