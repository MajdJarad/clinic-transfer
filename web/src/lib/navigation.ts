export interface NavLink {
  key: string;
  label: string;
  href: string;
}

// Real turn-by-turn navigation deep links. The driver taps one and the native
// map app opens with the destination prefilled.
// Yandex Navigator has the best live traffic coverage in Istanbul.
export function navigationLinks(lat: number, lng: number, label = ''): NavLink[] {
  const q = encodeURIComponent(label);
  return [
    {
      key: 'nav.yandex',
      label: 'Yandex',
      href: `https://yandex.com/maps/?rtext=~${lat},${lng}&rtt=auto`,
    },
    {
      key: 'nav.google',
      label: 'Google',
      href: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`,
    },
    {
      key: 'nav.organic',
      label: 'Organic Maps',
      // geo: is handled by Organic Maps and other installed map apps.
      href: `geo:${lat},${lng}?q=${lat},${lng}(${q})`,
    },
  ];
}
