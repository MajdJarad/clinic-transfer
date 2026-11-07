// Sends a WhatsApp message from the server through Meta's WhatsApp Cloud API.
// The patient's number is used here and never returned to the caller.
import { env, whatsappCloudEnabled } from '../env';
import { HttpError } from '../lib/http';

export interface OutgoingMessage {
  /** Digits only, with country code (no "+"). */
  to: string;
  /** Plain text (used when no template is configured). */
  text: string;
  /** Values for the approved template's body variables, in order. */
  templateParams: string[];
}

export function buildCloudPayload(m: OutgoingMessage, cfg = { templateName: env.whatsappTemplateName, lang: env.whatsappTemplateLang }) {
  if (cfg.templateName) {
    return {
      messaging_product: 'whatsapp',
      to: m.to,
      type: 'template',
      template: {
        name: cfg.templateName,
        language: { code: cfg.lang },
        components: [{ type: 'body', parameters: m.templateParams.map((text) => ({ type: 'text', text })) }],
      },
    };
  }
  return { messaging_product: 'whatsapp', to: m.to, type: 'text', text: { body: m.text, preview_url: false } };
}

export async function sendWhatsAppMessage(m: OutgoingMessage, fetchImpl: typeof fetch = fetch): Promise<void> {
  if (!whatsappCloudEnabled) throw new HttpError(503, 'WhatsApp sending is not configured');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const r = await fetchImpl(`${env.whatsappApiBase}/${env.whatsappPhoneNumberId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.whatsappToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(buildCloudPayload(m)),
      signal: controller.signal,
    });
    if (!r.ok) {
      // The provider's explanation goes to the server log only: it is not for drivers to read.
      // eslint-disable-next-line no-console
      console.error('[whatsapp] provider rejected the message:', r.status, (await r.text().catch(() => '')).slice(0, 300));
      throw new HttpError(502, 'تعذّر إرسال الرسالة للمريض');
    }
  } catch (e) {
    if (e instanceof HttpError) throw e;
    // eslint-disable-next-line no-console
    console.error('[whatsapp] request failed:', (e as Error).message);
    throw new HttpError(502, 'تعذّر إرسال الرسالة للمريض');
  } finally {
    clearTimeout(timer);
  }
}
