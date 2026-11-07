import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { useClinicName } from '../config';
import { useI18n } from '../i18n';
import { LanguageSelect, ThemeToggle } from '../components/Controls';
import { Button, ErrorText, Field, Input } from '../components/ui';

export function Login() {
  const { login, expired } = useAuth();
  const { t } = useI18n();
  const clinicName = useClinicName();
  const navigate = useNavigate();
  const [email, setEmail] = useState('admin@clinic.com');
  const [password, setPassword] = useState('admin123');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const user = await login(email.trim(), password);
      navigate(user.role === 'DRIVER' ? '/driver' : '/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('login.failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative grid min-h-full place-items-center bg-gradient-to-br from-slate-900 via-slate-900 to-brand-900 p-4">
      <div className="absolute end-4 top-4 flex items-center gap-2">
        <LanguageSelect />
        <ThemeToggle />
      </div>
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-2xl">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-2xl font-bold text-white shadow-lg">
            {t('common.app').charAt(0)}
          </div>
          <h1 className="text-xl font-bold text-fg">{t('login.title')}</h1>
          <p className="text-sm text-muted">{clinicName || t('common.clinic')}</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          {expired && (
            <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs font-semibold text-amber-700 dark:text-amber-300" data-testid="session-expired">
              انتهت جلستك أو لم يعد حسابك موجوداً على الخادم (قد تكون البيانات أُعيدت إلى الوضع الأصلي). سجّل الدخول من جديد.
            </p>
          )}
          <ErrorText>{error}</ErrorText>
          <Field label={t('login.email')}>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@clinic.com"
              dir="ltr"
              required
            />
          </Field>
          <Field label={t('login.password')}>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              dir="ltr"
              required
            />
          </Field>
          <Button type="submit" loading={loading} className="w-full">
            {t('login.submit')}
          </Button>
        </form>
        <div className="mt-6 rounded-lg bg-surface2 p-3 text-xs text-muted">
          <p className="mb-1 font-medium text-fg">{t('login.demo')}</p>
          <p>admin@clinic.com / admin123</p>
          <p>coordinator@clinic.com / coord123</p>
          <p>driver1@clinic.com / driver123</p>
        </div>
      </div>
    </div>
  );
}
