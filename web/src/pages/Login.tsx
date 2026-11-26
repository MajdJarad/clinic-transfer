import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { useClinicName } from '../config';
import { useI18n } from '../i18n';
import { LanguageSelect, ThemeToggle } from '../components/Controls';
import { Button, ErrorText, Field, Input } from '../components/ui';
import { BRAND_NAME, Logo } from '../components/Logo';

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
    <div className="relative grid min-h-full place-items-center p-4">
      <div className="absolute end-4 top-4 flex items-center gap-2">
        <LanguageSelect />
        <ThemeToggle />
      </div>
      <div className="w-full max-w-sm overflow-hidden rounded-[32px] border border-white/60 bg-surface shadow-float dark:border-white/5">
        <div className="flex justify-center px-6 pb-2 pt-9" dir="ltr">
          <Logo className="h-14 w-auto" />
        </div>
        <div className="p-7">
        <div className="mb-6 text-center">
          <h1 className="text-lg font-semibold tracking-wide text-fg">{clinicName || BRAND_NAME}</h1>
          <p className="mt-0.5 text-sm text-muted">{t('login.title')}</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          {expired && (
            <p className="rounded-2xl bg-[var(--tint-butter)] p-3 text-xs font-medium text-amber-800 dark:text-amber-300" data-testid="session-expired">
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
        <div className="mt-6 rounded-2xl bg-surface2 p-4 text-xs text-muted" dir="ltr">
          <p className="mb-1 font-medium text-fg" dir="auto">{t('login.demo')}</p>
          <p>admin@clinic.com / admin123</p>
          <p>coordinator@clinic.com / coord123</p>
          <p>driver1@clinic.com / driver123</p>
        </div>
        </div>
      </div>
    </div>
  );
}
