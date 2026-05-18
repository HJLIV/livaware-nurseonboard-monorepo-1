import type { Assessment, AssessmentResponse } from "@shared/schema";
import { renderEmailMarkdown } from "@shared/email-markdown";

export function buildEmailHtml(assessment: Assessment): string {
  const responses = assessment.responses as AssessmentResponse[];

  const responseRows = responses.map((r) => `
    <tr>
      <td style="padding: 16px 20px; border-bottom: 1px solid #2a2a5e;">
        <div style="font-family: 'Courier New', monospace; font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; color: #A8A29E; margin-bottom: 6px;">
          ${r.domain} · ${r.tag}
        </div>
        <div style="font-size: 13px; color: #C8A96E; margin-bottom: 10px; font-weight: 500;">
          Q${r.questionId}: ${r.prompt.substring(0, 120)}${r.prompt.length > 120 ? '...' : ''}
        </div>
        <div style="font-size: 14px; color: #F0ECE4; line-height: 1.7; white-space: pre-wrap;">
          ${escapeHtml(r.response)}
        </div>
        <div style="font-family: 'Courier New', monospace; font-size: 11px; color: #8A8A94; margin-top: 8px;">
          ${r.response.length} chars · ${r.timeSpent}s taken
        </div>
      </td>
    </tr>
  `).join('');

  // The LLM emits a wider variety of markdown than the previous regex
  // chain handled (`### h3`, `*italic*`, `*` bullets, `1.` numbered
  // lists, inline `code`). Run the full body through the shared email
  // markdown renderer so nothing leaks as raw `#`/`*` characters.
  const analysisHtml = assessment.aiAnalysis
    ? renderEmailMarkdown(assessment.aiAnalysis, {
        styles: {
          // Match this section's existing dark-card typography (the
          // surrounding <td> is colour:#F0ECE4DD font-size:14px line-height:1.8).
          paragraph:
            "color:#F0ECE4DD;font-size:14px;line-height:1.8;margin:0 0 14px;",
          h1: "color:#C8A96E;font-size:18px;font-weight:500;margin:24px 0 12px;line-height:1.3;",
          h2: "color:#C8A96E;font-size:16px;font-weight:500;margin:24px 0 12px;line-height:1.3;",
          h3: "color:#C8A96E;font-size:15px;font-weight:500;margin:20px 0 10px;line-height:1.3;",
          ul: "margin:0 0 14px;padding-left:22px;color:#F0ECE4DD;font-size:14px;line-height:1.75;",
          ol: "margin:0 0 14px;padding-left:22px;color:#F0ECE4DD;font-size:14px;line-height:1.75;",
        },
      })
    : '<p style="color: #A8A29E;">Analysis pending...</p>';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #020121; font-family: Georgia, 'Palatino Linotype', serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #020121; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="680" cellpadding="0" cellspacing="0" style="max-width: 680px; width: 100%;">
          
          <!-- Header -->
          <tr>
            <td style="padding: 0 0 32px;">
              <div style="font-family: 'Palatino Linotype', Georgia, serif; color: #F0ECE4; font-size: 18px; letter-spacing: 0.05em;">
                livaware
              </div>
            </td>
          </tr>

          <!-- Title -->
          <tr>
            <td style="padding: 0 0 8px;">
              <h1 style="color: #F0ECE4; font-size: 28px; font-weight: 400; margin: 0; letter-spacing: -0.02em;">
                Nurse Assessment Report
              </h1>
            </td>
          </tr>

          <!-- Candidate Info -->
          <tr>
            <td style="padding: 20px 0 32px;">
              <table cellpadding="0" cellspacing="0" style="background: #111140; border: 1px solid #2a2a5e; border-radius: 6px; width: 100%;">
                <tr>
                  <td style="padding: 20px 24px;">
                    <div style="font-family: 'Courier New', monospace; font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase; color: #8A8A94; margin-bottom: 12px;">
                      Candidate Details
                    </div>
                    <div style="color: #F0ECE4; font-size: 16px; margin-bottom: 4px;">${escapeHtml(assessment.nurseName)}</div>
                    <div style="color: #A8A29E; font-size: 14px;">${escapeHtml(assessment.nurseEmail)}</div>
                    ${assessment.nursePhone ? `<div style="color: #A8A29E; font-size: 14px;">${escapeHtml(assessment.nursePhone)}</div>` : ''}
                    <div style="font-family: 'Courier New', monospace; color: #8A8A94; font-size: 11px; margin-top: 8px;">
                      Completed: ${assessment.completedAt ? new Date(assessment.completedAt).toLocaleString('en-GB') : 'N/A'}
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- AI Analysis -->
          <tr>
            <td style="padding: 0 0 32px;">
              <table cellpadding="0" cellspacing="0" style="background: #0a0a2e; border: 1px solid #2a2a5e; border-left: 3px solid #C8A96E; border-radius: 0 6px 6px 0; width: 100%;">
                <tr>
                  <td style="padding: 24px 28px;">
                    <div style="font-family: 'Courier New', monospace; font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase; color: #C8A96E; margin-bottom: 16px;">
                      AI Clinical Assessment
                    </div>
                    <div style="color: #F0ECE4DD; font-size: 14px; line-height: 1.8;">
                      ${analysisHtml}
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Responses -->
          <tr>
            <td style="padding: 0 0 32px;">
              <div style="font-family: 'Courier New', monospace; font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase; color: #8A8A94; margin-bottom: 16px;">
                Full Responses
              </div>
              <table cellpadding="0" cellspacing="0" style="background: #111140; border: 1px solid #2a2a5e; border-radius: 6px; width: 100%;">
                ${responseRows}
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 32px 0; border-top: 1px solid #2a2a5e;">
              <div style="font-family: 'Courier New', monospace; color: #8A8A94; font-size: 11px; letter-spacing: 0.12em;">
                Livaware Ltd · London · Nurse-Led · Complex & Palliative Care
              </div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
