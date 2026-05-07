// lib/email.ts - simpler Resend-Wrapper für Server Code
// Erfordert ENV-Vars in Vercel: RESEND_API_KEY, RESEND_FROM_EMAIL, ADMIN_EMAIL

export type EmailMessage = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
};

export async function sendEmail(msg: EmailMessage): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev";

  if (!apiKey) {
    console.error("RESEND_API_KEY fehlt in den Environment-Variablen");
    return { ok: false, error: "RESEND_API_KEY missing" };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `FW-Gemeindebau <${from}>`,
        to: Array.isArray(msg.to) ? msg.to : [msg.to],
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("Resend API error:", res.status, body);
      return { ok: false, error: `Resend ${res.status}: ${body}` };
    }
    return { ok: true };
  } catch (err: any) {
    console.error("Resend fetch failed:", err);
    return { ok: false, error: err?.message ?? String(err) };
  }
}

// Email an Admin bei neuem User-Anmeldung
export async function notifyAdminNewUser(opts: {
  userEmail: string;
  userId: string;
  approvalToken: string;
  appUrl: string;
}) {
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) {
    console.error("ADMIN_EMAIL fehlt");
    return { ok: false, error: "ADMIN_EMAIL missing" };
  }

  const approveUrl = `${opts.appUrl}/admin/approve?token=${opts.approvalToken}&action=approve`;
  const rejectUrl  = `${opts.appUrl}/admin/approve?token=${opts.approvalToken}&action=reject`;

  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto;padding:24px">
      <h2 style="color:#003a78;margin-bottom:8px">Neuer Zugriffs-Antrag</h2>
      <p style="color:#475569;font-size:14px;line-height:1.5">
        Möchte sich neu anmelden und braucht deine Freigabe:
      </p>
      <div style="background:#f1f5f9;border-radius:8px;padding:16px;margin:16px 0;font-size:15px">
        <b>${opts.userEmail}</b>
      </div>
      <table cellpadding="0" cellspacing="0" style="margin:24px 0">
        <tr>
          <td style="padding-right:12px">
            <a href="${approveUrl}"
               style="background:#16a34a;color:white;padding:12px 20px;border-radius:8px;
                      text-decoration:none;font-weight:600;font-size:14px;display:inline-block">
              ✓ Freischalten
            </a>
          </td>
          <td>
            <a href="${rejectUrl}"
               style="background:#e5e7eb;color:#475569;padding:12px 20px;border-radius:8px;
                      text-decoration:none;font-weight:600;font-size:14px;display:inline-block">
              ✗ Ablehnen
            </a>
          </td>
        </tr>
      </table>
      <p style="color:#94a3b8;font-size:12px;line-height:1.5;margin-top:24px">
        Du erhältst diese Mail, weil du Admin der FW-Gemeindebau-App bist.
        Beide Links sind Einmal-Token und nach der ersten Verwendung ungültig.
      </p>
    </div>
  `;

  const text = `Neuer Zugriffs-Antrag von: ${opts.userEmail}\n\n` +
    `Freischalten:  ${approveUrl}\n` +
    `Ablehnen:      ${rejectUrl}\n`;

  return sendEmail({
    to: adminEmail,
    subject: `Neuer Nutzer: ${opts.userEmail}`,
    html,
    text,
  });
}

// Email an User: "Du bist freigeschaltet"
export async function notifyUserApproved(opts: {
  userEmail: string;
  appUrl: string;
}) {
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto;padding:24px">
      <h2 style="color:#16a34a;margin-bottom:8px">✓ Du bist freigeschaltet</h2>
      <p style="color:#475569;font-size:14px;line-height:1.5">
        Der Admin hat deinen Zugriff auf <b>FW-Gemeindebau</b> bestätigt.
        Du kannst dich jetzt einloggen.
      </p>
      <p style="margin:24px 0">
        <a href="${opts.appUrl}/login"
           style="background:#003a78;color:white;padding:12px 20px;border-radius:8px;
                  text-decoration:none;font-weight:600;font-size:14px">
          Zur App →
        </a>
      </p>
    </div>
  `;
  return sendEmail({
    to: opts.userEmail,
    subject: "FW-Gemeindebau: Zugriff freigeschaltet",
    html,
  });
}

