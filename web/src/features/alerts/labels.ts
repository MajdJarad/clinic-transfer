import type { AlertStatus, AlertType } from '../../types';

export const ALERT_TYPES: { type: AlertType; label: string; icon: string }[] = [
  { type: 'PATIENT', label: 'مشكلة مع المريض', icon: '🧑‍⚕️' },
  { type: 'VEHICLE', label: 'مشكلة في السيارة', icon: '🚗' },
  { type: 'ACCIDENT', label: 'حادث', icon: '💥' },
  { type: 'OTHER', label: 'أخرى', icon: '⚠️' },
];

export const alertTypeLabel = (t: AlertType) => ALERT_TYPES.find((x) => x.type === t)?.label ?? t;
export const alertTypeIcon = (t: AlertType) => ALERT_TYPES.find((x) => x.type === t)?.icon ?? '⚠️';

export const ALERT_STATUS_LABEL: Record<AlertStatus, string> = {
  OPEN: 'بانتظار الاستلام',
  ACKNOWLEDGED: 'تم الاستلام',
  RESOLVED: 'تم الحل',
};
