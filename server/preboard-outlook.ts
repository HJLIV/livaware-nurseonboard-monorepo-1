import { Client } from '@microsoft/microsoft-graph-client';

let connectionSettings: any;

async function getAccessToken() {
  if (connectionSettings && connectionSettings.settings.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token;
  }

  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? 'repl ' + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? 'depl ' + process.env.WEB_REPL_RENEWAL
    : null;

  if (!xReplitToken) {
    throw new Error('X-Replit-Token not found for repl/depl');
  }

  const response = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=outlook',
    {
      headers: {
        'Accept': 'application/json',
        'X-Replit-Token': xReplitToken
      }
    }
  );
  const data = await response.json();
  connectionSettings = data.items?.[0];

  if (!connectionSettings?.settings) {
    throw new Error('Outlook not connected');
  }

  const accessToken = connectionSettings.settings.access_token
    || connectionSettings.settings.oauth?.credentials?.access_token;

  if (!accessToken) {
    throw new Error('Outlook access token not available');
  }
  return accessToken;
}

export async function getUncachableOutlookClient() {
  const accessToken = await getAccessToken();

  return Client.initWithMiddleware({
    authProvider: {
      getAccessToken: async () => accessToken
    }
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

  await client.api('/me/sendMail').post({ message });
}
