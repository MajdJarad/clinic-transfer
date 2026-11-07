// Patient phone numbers are used exactly as typed, with their international prefix: no country code is
// ever added automatically. (The server applies the same rules; this gives the message before saving.)

export const normalizePhone = (raw: string): string => {
  const digits = (raw || '').replace(/\D/g, '');
  return digits.startsWith('00') ? digits.slice(2) : digits;
};

export const isValidInternationalPhone = (raw: string): boolean => /^[1-9]\d{7,14}$/.test(normalizePhone(raw));

export const PHONE_HELP = 'اكتب الرقم مع رمز الدولة، مثل +905331234567 أو 966501234567';
