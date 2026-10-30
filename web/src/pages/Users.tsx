import { useEffect, useState } from 'react';
import { api } from '../api';
import { useI18n } from '../i18n';
import { roleKeys } from '../labels';
import {
  Button,
  Card,
  EmptyState,
  ErrorText,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  StatusPill,
} from '../components/ui';
import type { Role, UserRecord } from '../types';

const ROLES: Role[] = ['ADMIN', 'COORDINATOR', 'DRIVER'];
const emptyForm = { name: '', email: '', phone: '', password: '', role: 'DRIVER' as Role };

export function Users() {
  const { t } = useI18n();
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    api.users.list().then(setUsers).finally(() => setLoading(false));
  };

  useEffect(load, []);

  const create = async () => {
    setError('');
    try {
      await api.users.create({ ...form });
      setOpen(false);
      setForm(emptyForm);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    }
  };

  const toggleActive = async (u: UserRecord) => {
    await api.users.update(u.id, { active: !u.active });
    load();
  };

  const changeRole = async (u: UserRecord, role: Role) => {
    await api.users.update(u.id, { role });
    load();
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('users.title')}
        subtitle={t('users.subtitle')}
        action={<Button onClick={() => setOpen(true)}>{t('users.new')}</Button>}
      />

      <Card className="p-4">
        {loading ? (
          <EmptyState text={t('common.loading')} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-start text-sm">
              <thead className="text-xs text-muted">
                <tr className="border-b border-border">
                  <th className="py-2 text-start font-medium">{t('users.name')}</th>
                  <th className="py-2 text-start font-medium">{t('users.email')}</th>
                  <th className="py-2 text-start font-medium">{t('users.phone')}</th>
                  <th className="py-2 text-start font-medium">{t('users.role')}</th>
                  <th className="py-2 text-start font-medium">{t('users.status')}</th>
                  <th className="py-2 text-start font-medium">{t('users.action')}</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-border/60">
                    <td className="py-3 font-medium text-fg">{u.name}</td>
                    <td className="py-3 text-muted" dir="ltr">
                      {u.email}
                    </td>
                    <td className="py-3 text-muted" dir="ltr">
                      {u.phone ?? '—'}
                    </td>
                    <td className="py-3">
                      <Select
                        className="w-36 !py-1 text-xs"
                        value={u.role}
                        onChange={(e) => changeRole(u, e.target.value as Role)}
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {t(roleKeys[r])}
                          </option>
                        ))}
                      </Select>
                    </td>
                    <td className="py-3">
                      <StatusPill status={u.active ? 'ACTIVE' : 'OFFLINE'} label={u.active ? t('users.enabled') : t('users.disabled')} />
                    </td>
                    <td className="py-3">
                      <Button size="sm" variant={u.active ? 'ghost' : 'secondary'} onClick={() => toggleActive(u)}>
                        {u.active ? t('users.disable') : t('users.enable')}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={open} title={t('users.createTitle')} onClose={() => setOpen(false)}>
        <div className="space-y-4">
          <ErrorText>{error}</ErrorText>
          <Field label={t('users.name')}>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label={t('users.email')}>
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} dir="ltr" />
          </Field>
          <Field label={t('users.phone')}>
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} dir="ltr" />
          </Field>
          <Field label={t('users.password')}>
            <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} dir="ltr" />
          </Field>
          <Field label={t('users.role')} hint={t('users.roleHint')}>
            <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {t(roleKeys[r])}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={create} disabled={!form.name || !form.email || form.password.length < 6}>
              {t('common.save')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
