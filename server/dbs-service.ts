import { XMLParser } from "fast-xml-parser";

export interface DbsCheckResult {
  isCurrent: boolean;
  isClear: boolean;
  status: "BLANK_NO_NEW_INFO" | "NON_BLANK_NO_NEW_INFO" | "NEW_INFO";
  resultType: "SUCCESS" | "FAILURE";
  forename: string;
  surname: string;
  printDate: string;
}

export class DbsUpdateServiceError extends Error {
  constructor(
    message: string,
    public code: "ACCESS_DENIED" | "NOT_FOUND" | "CONNECTION_FAILED" | "INVALID_RESPONSE" | "NOT_CONFIGURED" | "MALFORMED_DATA"
  ) {
    super(message);
    this.name = "DbsUpdateServiceError";
  }
}

function normalizeDateOfBirth(input: string): string {
  const s = input.trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split("-");
    return `${d}/${m}/${y}`;
  }

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
    return s;
  }

  if (/^\d{2}-\d{2}-\d{4}$/.test(s)) {
    const [d, m, y] = s.split("-");
    return `${d}/${m}/${y}`;
  }

  const dt = new Date(s);
  if (isNaN(dt.getTime())) {
    throw new DbsUpdateServiceError("Invalid date of birth format", "MALFORMED_DATA");
  }
  const dd = String(dt.getDate()).padStart(2, "0");
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const yyyy = dt.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

export async function checkDbsCertificate(
  certificateNumber: string,
  surname: string,
  dateOfBirth: string
): Promise<DbsCheckResult> {
  const orgName = process.env.DBS_ORG_NAME;
  const forename = process.env.DBS_FORENAME;
  const surnameReq = process.env.DBS_SURNAME;

  if (!orgName || !forename || !surnameReq) {
    throw new DbsUpdateServiceError(
      "DBS Update Service not configured. Set DBS_ORG_NAME, DBS_FORENAME, and DBS_SURNAME environment variables.",
      "NOT_CONFIGURED"
    );
  }

  const dob = normalizeDateOfBirth(dateOfBirth);

  const params = new URLSearchParams({
    hasAgreedTermsAndConditions: "true",
    organisationName: orgName,
    employeeForename: forename,
    employeeSurname: surnameReq,
    surname: surname,
    dateOfBirth: dob,
  });

  const url = `https://secure.crbonline.gov.uk/crsc/api/status/${encodeURIComponent(certificateNumber)}?${params.toString()}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/xml" },
      signal: AbortSignal.timeout(60000),
    });
  } catch (err) {
    throw new DbsUpdateServiceError(
      `Failed to connect to DBS Update Service: ${err instanceof Error ? err.message : "Unknown error"}`,
      "CONNECTION_FAILED"
    );
  }

  if (response.status === 401 || response.status === 403) {
    throw new DbsUpdateServiceError("Access denied by DBS Update Service. Check your credentials.", "ACCESS_DENIED");
  }

  if (response.status === 404) {
    throw new DbsUpdateServiceError("Certificate not found on the DBS Update Service.", "NOT_FOUND");
  }

  if (!response.ok) {
    throw new DbsUpdateServiceError(
      `DBS Update Service returned status ${response.status}`,
      "CONNECTION_FAILED"
    );
  }

  const xml = await response.text();

  const parser = new XMLParser({ ignoreAttributes: true });
  let parsed: any;
  try {
    parsed = parser.parse(xml);
  } catch {
    throw new DbsUpdateServiceError("Invalid XML response from DBS Update Service", "INVALID_RESPONSE");
  }

  const result = parsed?.statusCheckResult;
  if (!result) {
    throw new DbsUpdateServiceError("Unexpected response format from DBS Update Service", "INVALID_RESPONSE");
  }

  const resultType = result.statusCheckResultType;
  const status = result.status;
  const fname = result.forename || "";
  const sname = result.surname || "";
  const printDate = result.printDate || "";

  if (!resultType || !status) {
    throw new DbsUpdateServiceError("Missing required fields in DBS response", "INVALID_RESPONSE");
  }

  const isSuccess = resultType === "SUCCESS";

  return {
    isCurrent: isSuccess && status !== "NEW_INFO",
    isClear: isSuccess && status === "BLANK_NO_NEW_INFO",
    status,
    resultType,
    forename: fname,
    surname: sname,
    printDate,
  };
}

export function isDbsConfigured(): boolean {
  return !!(process.env.DBS_ORG_NAME && process.env.DBS_FORENAME && process.env.DBS_SURNAME);
}
