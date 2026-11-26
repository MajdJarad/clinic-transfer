import type { AlertStatus, AlertType } from '../../types';

export const ALERT_TYPES: { type: AlertType; label: string; icon: string }[] = [
  { type: 'PATIENT', label: 'مشكلة مع المريض', icon: 'heart' },
  { type: 'VEHICLE', label: 'مشكلة في السيارة', icon: 'car' },
  { type: 'ACCIDENT', label: 'حادث', icon: 'alert' },
  { type: 'OTHER', label: 'أخرى', icon: 'info' },
];

export const alertTypeLabel = (t: AlertType) => ALERT_TYPES.find((x) => x.type === t)?.label ?? t;
export const alertTypeIcon = (t: AlertType) => ALERT_TYPES.find((x) => x.type === t)?.icon ?? 'alert';

export const ALERT_STATUS_LABEL: Record<AlertStatus, string> = {
  OPEN: 'بانتظار الاستلام',
  ACKNOWLEDGED: 'تم الاستلام',
  RESOLVED: 'تم الحل',
};
