import { describe, expect, it, vi } from 'vitest';
import { buildCloudPayload } from './whatsappCloud';

const msg = { to: '905331338505', text: 'مرحباً سارة', templateParams: ['سارة', 'تويوتا كورولا (أبيض)', '34 ABC 123', 'محمد', '0500000000'] };

describe('WhatsApp Cloud API payload', () => {
  it('sends plain text when no template is configured', () => {
    const p = buildCloudPayload(msg, { templateName: '', lang: 'ar' }) as any;
    expect(p).toMatchObject({ messaging_product: 'whatsapp', to: '905331338505', type: 'text' });
    expect(p.text.body).toBe('مرحباً سارة');
  });
  it('sends the approved template with the body variables in order', () => {
    const p = buildCloudPayload(msg, { templateName: 'car_arrived', lang: 'ar' }) as any;
    expect(p.type).toBe('template');
    expect(p.template.name).toBe('car_arrived');
    expect(p.template.language.code).toBe('ar');
    expect(p.template.components[0].parameters.map((x: any) => x.text)).toEqual(msg.templateParams);
  });
  it('addresses the patient by digits only (no "+" or spaces)', () => {
    expect(String((buildCloudPayload(msg) as any).to)).toMatch(/^\d+$/);
  });
});

describe('sendWhatsAppMessage', () => {
  it('refuses to run when sending is not configured', async () => {
    const { sendWhatsAppMessage } = await import('./whatsappCloud');
    await expect(sendWhatsAppMessage(msg, vi.fn() as any)).rejects.toMatchObject({ status: 503 });
  });
});
