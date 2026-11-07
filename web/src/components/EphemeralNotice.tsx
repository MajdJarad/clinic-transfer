import { useEffect, useState } from 'react';
import { api } from '../api';
import { ageLabel } from '../features/tracking/freshness';

const DISMISS_KEY = 'ephemeral_notice_dismissed';

function dismissed(): boolean {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Says plainly when the server's database is temporary. On a free host the database file lives inside the
 * container: every deploy and every wake-up after sleep puts the demo data back, so accounts, trips,
 * assignments, positions and settings entered in the app disappear. That looks exactly like "the accounts
 * are no longer linked to the database", so the people who run the clinic must be told.
 */
export function EphemeralNotice() {
  const [info, setInfo] = useState<{ uptimeSeconds: number } | null>(null);
  const [hidden, setHidden] = useState(dismissed);

  useEffect(() => {
    let alive = true;
    api.health().then((h) => {
      if (alive && h && h.databasePersistent === false) setInfo({ uptimeSeconds: h.uptimeSeconds ?? 0 });
    });
    return () => {
      alive = false;
    };
  }, []);

  if (!info || hidden) return null;
  return (
    <div className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-amber-500/50 bg-amber-500/10 p-3 text-xs font-semibold text-amber-900 dark:text-amber-200" data-testid="ephemeral-notice" role="status">
      <p className="leading-relaxed">
        ⚠️ <b>قاعدة البيانات على هذا الخادم مؤقتة.</b> كل ما تضيفه أو تعدّله (سائقون، رحلات، إسنادات، مواقع، إعدادات) يعود إلى بيانات العرض الأصلية عند كل نشر
        جديد وعند عودة الخدمة من النوم (بعد 15 دقيقة دون نشاط)، وحينها تبدو الحسابات والرحلات «غير مرتبطة». آخر تشغيل للخادم: {ageLabel(info.uptimeSeconds)}.
        للحفظ الدائم يلزم قرص دائم على Render أو قاعدة بيانات خارجية.
      </p>
      <button
        type="button"
        onClick={() => {
          try {
            sessionStorage.setItem(DISMISS_KEY, '1');
          } catch {
            /* ignore */
          }
          setHidden(true);
        }}
        className="shrink-0 rounded-lg bg-amber-600 px-2.5 py-1 text-white"
        data-testid="ephemeral-dismiss"
      >
        فهمت
      </button>
    </div>
  );
}
