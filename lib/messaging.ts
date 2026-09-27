// Messaging provider abstraction.
// Today everything runs through the SIMULATOR (no Twilio/SES keys needed).
// To go live, set SMS_PROVIDER=twilio + TWILIO_* env vars and
// EMAIL_PROVIDER=ses + SES_* env vars. Zero code changes required.

export interface SmsProvider {
  send(to: string, body: string): Promise<{ providerId: string }>;
}
export interface EmailProvider {
  send(to: string, subject: string, body: string): Promise<{ providerId: string }>;
}

class SimulatorSms implements SmsProvider {
  async send(to: string, body: string) {
    console.log(`[SIMULATOR SMS -> ${to}] ${body}`);
    return { providerId: `sim_sms_${Date.now().toString(36)}` };
  }
}
class SimulatorEmail implements EmailProvider {
  async send(to: string, subject: string, body: string) {
    console.log(`[SIMULATOR EMAIL -> ${to}] ${subject} | ${body.slice(0, 80)}`);
    return { providerId: `sim_email_${Date.now().toString(36)}` };
  }
}

// Future live providers plug in here behind the same interface.
function getSmsProvider(): SmsProvider {
  const which = (process.env.SMS_PROVIDER ?? "simulator").toLowerCase();
  if (which === "simulator") return new SimulatorSms();
  throw new Error(`SMS provider "${which}" is not configured. Set SMS_PROVIDER=simulator or add credentials.`);
}
function getEmailProvider(): EmailProvider {
  const which = (process.env.EMAIL_PROVIDER ?? "simulator").toLowerCase();
  if (which === "simulator") return new SimulatorEmail();
  throw new Error(`Email provider "${which}" is not configured.`);
}

export function isSimulator() {
  return (process.env.SMS_PROVIDER ?? "simulator") === "simulator";
}

export async function sendSms(to: string, body: string) {
  return getSmsProvider().send(to, body);
}
export async function sendEmail(to: string, subject: string, body: string) {
  return getEmailProvider().send(to, subject, body);
}
