/**
 * `agentkit evidence export` (stack#4) — pull a signed compliance evidence pack
 * from a running stack and write it to disk for audit.
 *
 * Builds on stack#3's hash chain: `audit verify` is the read primitive, this
 * packages it. Fetches AgentLens's signed export
 * (GET /api/audit/verify/export) — the full event chain + chain-verification
 * verdict + HMAC signature — and persists it as a JSON archive. Export succeeds
 * even when the chain is NOT verified: the verdict is part of the evidence
 * (you record what you found), so `ok` means "pack written", and `verified`
 * carries the integrity result.
 */

import { Command } from "commander";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

export interface EvidenceExportOptions {
  url?: string;
  apiKey?: string;
  from?: string;
  to?: string;
  out?: string;
  timeout?: number;
}

export interface EvidenceExportResult {
  ok: boolean;
  outPath?: string;
  totalEvents?: number;
  verified?: boolean;
  signed?: boolean;
  url: string;
  error?: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function agentLensUrl(opt?: string): string {
  return (opt ?? process.env["AGENTLENS_URL"] ?? "http://localhost:3000").replace(/\/+$/, "");
}

export async function evidenceExport(opts: EvidenceExportOptions = {}): Promise<EvidenceExportResult> {
  const url = agentLensUrl(opts.url);
  const timeout = opts.timeout ?? 30_000;
  const apiKey = opts.apiKey ?? process.env["AGENTLENS_API_KEY"];
  const headers: Record<string, string> = apiKey ? { Authorization: `Bearer ${apiKey}` } : {};

  const to = opts.to ?? new Date().toISOString();
  const from = opts.from ?? new Date(Date.parse(to) - 364 * DAY_MS).toISOString();

  let pack: {
    exportedAt?: string;
    totalEvents?: number;
    chainVerification?: { verified?: boolean };
    signature?: string | null;
  };
  try {
    const res = await fetch(
      `${url}/api/audit/verify/export?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      { headers, signal: AbortSignal.timeout(timeout) },
    );
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, url, error: `GET /api/audit/verify/export → ${res.status}${body.error ? ` (${body.error})` : ""}` };
    }
    pack = (await res.json()) as typeof pack;
  } catch (err) {
    return { ok: false, url, error: `Could not reach AgentLens at ${url}: ${err instanceof Error ? err.message : String(err)}` };
  }

  const stamp = (pack.exportedAt ?? to).replace(/[:.]/g, "-");
  const outPath = resolve(opts.out ?? `evidence-${stamp}.json`);
  writeFileSync(outPath, JSON.stringify(pack, null, 2) + "\n", "utf-8");

  return {
    ok: true,
    outPath,
    totalEvents: pack.totalEvents ?? 0,
    verified: pack.chainVerification?.verified ?? false,
    signed: Boolean(pack.signature),
    url,
  };
}

export function formatEvidenceExport(r: EvidenceExportResult): string {
  if (!r.ok) return `✗ Evidence export failed — ${r.error}`;
  const lines = [
    `✓ Evidence pack exported`,
    `  file:     ${r.outPath}`,
    `  events:   ${r.totalEvents}`,
    `  chain:    ${r.verified ? "verified ✓" : "NOT verified ✗"}`,
    `  signed:   ${r.signed ? "yes (HMAC)" : "no (no signing key on the server)"}`,
  ];
  if (!r.verified) lines.push(`  ⚠ the exported chain did not verify — recorded as part of the evidence`);
  return lines.join("\n");
}

export function registerEvidenceCommand(program: Command): void {
  const evidence = program.command("evidence").description("Compliance evidence packs from a running stack");

  evidence
    .command("export")
    .description("Export a signed compliance evidence pack (audit chain + verdict) to a JSON file")
    .option("-u, --url <url>", "AgentLens base URL (default: $AGENTLENS_URL or http://localhost:3000)")
    .option("-k, --api-key <key>", "AgentLens API key (default: $AGENTLENS_API_KEY; omit when AUTH_DISABLED)")
    .option("--from <iso>", "Range start (ISO 8601; default: 1 year ago)")
    .option("--to <iso>", "Range end (ISO 8601; default: now)")
    .option("-o, --out <file>", "Output file (default: evidence-<timestamp>.json)")
    .option("-t, --timeout <ms>", "Request timeout in ms", "30000")
    .action(async (opts) => {
      const result = await evidenceExport({
        url: opts.url, apiKey: opts.apiKey, from: opts.from, to: opts.to,
        out: opts.out, timeout: Number(opts.timeout),
      });
      console.log(formatEvidenceExport(result));
      process.exitCode = result.ok ? 0 : 1;
    });
}
