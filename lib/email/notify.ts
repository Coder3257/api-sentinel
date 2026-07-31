import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY || "temp");

export async function sendPrOpenedEmail(
  userEmail: string,
  repoName: string,
  prUrl: string
) {
  try {
    if (!process.env.RESEND_API_KEY) {
      console.warn("RESEND_API_KEY is not set. Skipping email notification.");
      return;
    }

    const fromAddress = process.env.RESEND_FROM_EMAIL || "API Sentinel <onboarding@resend.dev>";

    const { data, error } = await resend.emails.send({
      from: fromAddress,
      to: userEmail,
      subject: `API Sentinel caught a breaking change in ${repoName}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px; color: #1e293b;">
          <h2 style="color: #8b5cf6;">API Sentinel Alert</h2>
          <p>Hello,</p>
          <p>We detected a breaking, deprecated, or additive change in the Stripe API specs that affects your repository <strong>${repoName}</strong>.</p>
          <p>An automated compatibility fix has been generated, verified, and successfully shipped as a pull request.</p>
          <p style="margin: 30px 0; text-align: center;">
            <a href="${prUrl}" style="background-color: #8b5cf6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">View Pull Request</a>
          </p>
          <p style="color: #64748b; font-size: 12px; border-top: 1px solid #e2e8f0; padding-top: 20px;">
            This is an automated notification from API Sentinel.
          </p>
        </div>
      `,
    });

    if (error) {
      console.error("Resend email error:", error);
    } else {
      console.log(`[EMAIL] Notification sent to ${userEmail} for repo ${repoName}:`, data?.id);
    }
  } catch (err) {
    console.error("Failed to send PR opened email notification:", err);
  }
}
