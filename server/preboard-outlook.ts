import { ConfidentialClientApplication } from "@azure/msal-node";
import { Client } from "@microsoft/microsoft-graph-client";

const TENANT_ID = process.env.AZURE_AD_TENANT_ID;
const CLIENT_ID = process.env.AZURE_AD_CLIENT_ID;
const CLIENT_SECRET = process.env.AZURE_AD_CLIENT_SECRET;
const SENDER_EMAIL = process.env.AZURE_AD_SENDER_EMAIL || "onboard@livaware.co.uk";

let msalApp: ConfidentialClientApplication | null = null;

function getMsalApp(): ConfidentialClientApplication {
  if (!msalApp) {
    if (!TENANT_ID || !CLIENT_ID || !CLIENT_SECRET) {
      throw new Error("Azure AD credentials not configured (AZURE_AD_TENANT_ID, AZURE_AD_CLIENT_ID, AZURE_AD_CLIENT_SECRET)");
    }
    msalApp = new ConfidentialClientApplication({
      auth: {
        clientId: CLIENT_ID,
        authority: `https://login.microsoftonline.com/${TENANT_ID}`,
        clientSecret: CLIENT_SECRET,
      },
    });
  }
  return msalApp;
}

export async function getUncachableOutlookClient(): Promise<Client> {
  const app = getMsalApp();
  const result = await app.acquireTokenByClientCredential({
    scopes: ["https://graph.microsoft.com/.default"],
  });

  if (!result?.accessToken) {
    throw new Error("Failed to acquire access token for Microsoft Graph");
  }

  return Client.initWithMiddleware({
    authProvider: {
      getAccessToken: async () => result.accessToken,
    },
  });
}

interface EmailAttachment {
  name: string;
  contentType: string;
  contentBytes: string;
}

export async function sendEmail(to: string, subject: string, htmlBody: string, attachments?: EmailAttachment[]) {
  const client = await getUncachableOutlookClient();

  const message: Record<string, unknown> = {
    subject,
    body: {
      contentType: "HTML",
      content: htmlBody,
    },
    toRecipients: [
      {
        emailAddress: {
          address: to,
        },
      },
    ],
  };

  if (attachments && attachments.length > 0) {
    message.attachments = attachments.map((att) => ({
      "@odata.type": "#microsoft.graph.fileAttachment",
      name: att.name,
      contentType: att.contentType,
      contentBytes: att.contentBytes,
    }));
  }

  await client.api(`/users/${SENDER_EMAIL}/sendMail`).post({ message });
}
