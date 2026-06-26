/**
 * `agentkit audit verify` (stack#3) — walk the live audit hash chain of a
 * running stack and report PASS/FAIL.
 *
 * Talks to AgentLens's audit API:
 *   GET /api/audit/verify         — server-side chain verification verdict
 *   GET /api/audit/verify/export  — events with prevHash/hash for an INDEPENDENT
 *                                   client-side linkage cross-check
 *
 * We don't just trust the server's boolean: we also re-walk the exported chain
 * locally (each event's prevHash must equal the previous event's hash, per
 * session). PASS requires both the server verdict AND the local linkage to hold.
 * Exit code is non-zero on FAIL so CI/scripts can gate on it.
 */

import { Command } from "commander";

export interface AuditVerifyOptions {
  url?: string;
  apiKey?: string;
  from?: string;
  to?: string;
  session?: string;
  timeout?: number;
}

interface ExportedEvent {
  id: string;
  timestamp: string;
  sessionId: string;
  prevHash: string | null;
  hash: string;
}

export interface AuditVerifyResult {
  ok: boolean; // PASS/FAIL — the bottom line
  verified: boolean; // server-side verdict
  sessionsVerified: number;
  brokenChains: { sessionId?: string; reason?: string }[];
  linkageOk: boolean; // independent client-side cross-check
  linkageChecked: number; // events whose prevHash linkage we re-walked
  url: string;
  error?: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function defaultUrl(opt?: string): string {
  return (opt ?? process.env["AGENTLENS_URL"] ?? "http://localhost:3000").replace(/\/+$/, "");
}

/** Re-walk the exported chain locally: per session, event[i].prevHash === event[i-1].hash. */
export function checkLinkage(events: ExportedEvent[]): { linkageOk: boolean; linkageChecked: number } {
  const bySession = new Map<string, ExportedEvent[]>();
  for (const e of events) {
    const arr = bySession.get(e.sessionId) ?? [];
    arr.push(e);
    bySession.set(e.sessionId, arr);
  }
  let checked = 0;
  for (const arr of bySession.values()) {
    arr.sort((a, b) => (a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0));
    for (let i = 1; i < arr.length; i++) {
      checked++;
      if (arr[i]!.prevHash !== arr[i - 1]!.hash) {
        return { linkageOk: false, linkageChecked: checked };
      }
    }
  }
  return { linkageOk: true, linkageChecked: checked };
}

export async function auditVerify(opts: AuditVerifyOptions = {}): Promise<AuditVerifyResult> {
  const url = defaultUrl(opts.url);
  const timeout = opts.timeout ?? 30_000;
  const apiKey = opts.apiKey ?? process.env["AGENTLENS_API_KEY"];
  const headers: Record<string, string> = apiKey ? { Authorization: `Bearer ${apiKey}` } : {};

  const to = opts.to ?? new Date().toISOString();
  // The endpoint caps the range at 1 year and requires from/to or a sessionId.
  const from = opts.from ?? new Date(Date.parse(to) - 364 * DAY_MS).toISOString();
  const q = opts.session
    ? `sessionId=${encodeURIComponent(opts.session)}`
    : `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;

  const base: AuditVerifyResult = {
    ok: false, verified: false, sessionsVerified: 0, brokenChains: [],
    linkageOk: false, linkageChecked: 0, url,
  };

  // 1. Authoritative server-side verification.
  let v: { verified: boolean; sessionsVerified?: number; brokenChains?: { sessionId?: string; reason?: string }[] };
  try {
    const res = await fetch(`${url}/api/audit/verify?${q}`, { headers, signal: AbortSignal.timeout(timeout) });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      return { ...base, error: `GET /api/audit/verify → ${res.status}${body.error ? ` (${body.error})` : ""}` };
    }
    v = (await res.json()) as typeof v;
  } catch (err) {
    return { ...base, error: `Could not reach AgentLens at ${url}: ${err instanceof Error ? err.message : String(err)}` };
  }

  // 2. Independent client-side linkage cross-check (best-effort; doesn't need the signing key).
  let linkageOk = true;
  let linkageChecked = 0;
  try {
    const ex = await fetch(`${url}/api/audit/verify/export?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, {
      headers, signal: AbortSignal.timeout(timeout),
    });
    if (ex.ok) {
      const pack = (await ex.json()) as { events?: ExportedEvent[] };
      ({ linkageOk, linkageChecked } = checkLinkage(pack.events ?? []));
    }
  } catch {
    // export is optional — the server verdict still stands.
  }

  const verified = v.verified === true;
  return {
    ok: verified && linkageOk,
    verified,
    sessionsVerified: v.sessionsVerified ?? 0,
    brokenChains: v.brokenChains ?? [],
    linkageOk,
    linkageChecked,
    url,
  };
}

export function formatAuditVerify(r: AuditVerifyResult): string {
  if (r.error) {
    return `✗ FAIL — ${r.error}`;
  }
  const lines: string[] = [];
  lines.push(r.ok ? "✓ PASS — audit hash chain verified" : "✗ FAIL — audit hash chain integrity check failed");
  lines.push(`  endpoint:          ${r.url}/api/audit/verify`);
  lines.push(`  server verdict:    ${r.verified ? "verified" : "NOT verified"} (${r.sessionsVerified} session(s))`);
  lines.push(`  local re-walk:     ${r.linkageOk ? `linkage intact (${r.linkageChecked} links)` : "LINKAGE BROKEN"}`);
  if (r.brokenChains.length) {
    lines.push(`  broken chains:     ${r.brokenChains.length}`);
    for (const b of r.brokenChains.slice(0, 5)) {
      lines.push(`    - ${b.sessionId ?? "?"}${b.reason ? `: ${b.reason}` : ""}`);
    }
  }
  return lines.join("\n");
}

export function registerAuditCommand(program: Command): void {
  const audit = program.command("audit").description("Audit-trail verification for a running stack");

  audit
    .command("verify")
    .description("Walk the live AgentLens audit hash chain and report PASS/FAIL")
    .option("-u, --url <url>", "AgentLens base URL (default: $AGENTLENS_URL or http://localhost:3000)")
    .option("-k, --api-key <key>", "AgentLens API key (default: $AGENTLENS_API_KEY; omit when AUTH_DISABLED)")
    .option("--from <iso>", "Range start (ISO 8601; default: 1 year ago)")
    .option("--to <iso>", "Range end (ISO 8601; default: now)")
    .option("-s, --session <id>", "Verify a single session instead of a date range")
    .option("-t, --timeout <ms>", "Request timeout in ms", "30000")
    .action(async (opts) => {
      const result = await auditVerify({
        url: opts.url, apiKey: opts.apiKey, from: opts.from, to: opts.to,
        session: opts.session, timeout: Number(opts.timeout),
      });
      console.log(formatAuditVerify(result));
      process.exitCode = result.ok ? 0 : 1;
    });
}
