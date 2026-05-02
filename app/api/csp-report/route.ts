/**
 * POST /api/csp-report — receives CSP violation reports from browsers.
 * Logs a one-line summary to stdout (visible in Vercel function logs).
 * Returns 204. No persistence.
 */
export const runtime = "edge";

interface CspReport {
  "document-uri"?: string;
  "blocked-uri"?: string;
  "violated-directive"?: string;
  "effective-directive"?: string;
  "source-file"?: string;
  "line-number"?: number;
  disposition?: string;
}

interface ReportToPayload {
  type?: string;
  body?: {
    documentURL?: string;
    blockedURL?: string;
    effectiveDirective?: string;
    disposition?: string;
    sourceFile?: string;
    lineNumber?: number;
  };
}

function summarize(r: Partial<CspReport & ReportToPayload["body"]>): string {
  const directive = r["effective-directive"] ?? r.effectiveDirective ?? "?";
  const blocked = r["blocked-uri"] ?? r.blockedURL ?? "?";
  const doc = r["document-uri"] ?? r.documentURL ?? "?";
  return `[csp] ${directive} blocked=${blocked} on=${doc}`;
}

export async function POST(request: Request) {
  try {
    const text = await request.text();
    if (!text) return new Response(null, { status: 204 });

    const ct = request.headers.get("content-type") ?? "";
    const data = JSON.parse(text) as unknown;

    if (Array.isArray(data)) {
      for (const item of data as ReportToPayload[]) {
        if (item?.body) console.log(summarize(item.body));
      }
    } else if (ct.includes("csp-report") && data && typeof data === "object") {
      const r = (data as { "csp-report"?: CspReport })["csp-report"];
      if (r) console.log(summarize(r));
    } else {
      console.log("[csp] unrecognized payload:", text.slice(0, 500));
    }
  } catch (err) {
    console.error("[csp] report parse error:", err);
  }
  return new Response(null, { status: 204 });
}
