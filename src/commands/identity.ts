/**
 * `agentkit identity` (#9) — the cross-product agent-identity spine.
 *
 * Mints / inspects / rotates ed25519 agent identities. The public material
 * (id, public key, fingerprint) is the portable identity other products
 * (AgentLens / Lore / AgentGate / FormBridge / AgentEval) reference; the
 * private key is the secret that proves it.
 *
 * Storage: identities live under ~/.agentkit/identities/ by default (NOT in the
 * project's agentkit.config.yaml, which is typically committed) — so a private
 * key never lands in a repo. Override with --store <dir> or AGENTKIT_HOME.
 *   <store>/identities/<id>.json   public record (safe to share)
 *   <store>/identities/<id>.key    pkcs8 PEM private key, mode 0600
 *   <store>/audit.log              append-only JSONL of every identity op
 *
 * Secrets are never printed — output shows the id, fingerprint and public key
 * only, plus the on-disk path of the (0600) private key.
 */

import { Command } from "commander";
import {
  generateKeyPairSync,
  createPublicKey,
  createHash,
  type KeyObject,
} from "node:crypto";
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  appendFileSync,
  renameSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface IdentityRecord {
  id: string;
  algorithm: "ed25519";
  /** base64 of the SPKI/DER public key. */
  publicKey: string;
  /** "SHA256:<base64>" digest of the public key — the human-checkable fingerprint. */
  fingerprint: string;
  name?: string;
  createdAt: string;
  status: "active" | "rotated";
  /** Public keys this identity used before its current one (rotation history). */
  previousKeys?: { publicKey: string; fingerprint: string; rotatedAt: string }[];
}

export interface IdentityStore {
  /** Root dir (e.g. ~/.agentkit). */
  root: string;
}

/** Resolve the identity store root: --store, else AGENTKIT_HOME, else ~/.agentkit. */
export function resolveStore(storeOpt?: string): IdentityStore {
  const root = storeOpt ?? process.env["AGENTKIT_HOME"] ?? join(homedir(), ".agentkit");
  return { root };
}

function identitiesDir(store: IdentityStore): string {
  return join(store.root, "identities");
}
function recordPath(store: IdentityStore, id: string): string {
  return join(identitiesDir(store), `${id}.json`);
}
function keyPath(store: IdentityStore, id: string): string {
  return join(identitiesDir(store), `${id}.key`);
}
function auditPath(store: IdentityStore): string {
  return join(store.root, "audit.log");
}

function publicMaterial(publicKey: KeyObject): { publicKey: string; fingerprint: string; der: Buffer } {
  const der = publicKey.export({ type: "spki", format: "der" }) as Buffer;
  return {
    publicKey: der.toString("base64"),
    fingerprint: "SHA256:" + createHash("sha256").update(der).digest("base64"),
    der,
  };
}

/** Append an audit entry (best-effort append-only JSONL). */
export function appendAudit(store: IdentityStore, entry: { op: string; id: string; ts: string; [k: string]: unknown }): void {
  mkdirSync(store.root, { recursive: true });
  appendFileSync(auditPath(store), JSON.stringify(entry) + "\n", "utf-8");
}

export function readIdentity(store: IdentityStore, id: string): IdentityRecord {
  const path = recordPath(store, id);
  if (!existsSync(path)) {
    throw new Error(`Identity not found: ${id}`);
  }
  return JSON.parse(readFileSync(path, "utf-8")) as IdentityRecord;
}

function writeIdentity(store: IdentityStore, record: IdentityRecord): void {
  mkdirSync(identitiesDir(store), { recursive: true });
  writeFileSync(recordPath(store, record.id), JSON.stringify(record, null, 2) + "\n", "utf-8");
}

function writePrivateKey(store: IdentityStore, id: string, pem: string): string {
  mkdirSync(identitiesDir(store), { recursive: true });
  const path = keyPath(store, id);
  // 0600 — owner read/write only. (No-op on Windows ACLs, but harmless.)
  writeFileSync(path, pem, { encoding: "utf-8", mode: 0o600 });
  return path;
}

/** Mint a fresh ed25519 identity. Returns the public record (never the secret). */
export function mintIdentity(store: IdentityStore, opts: { name?: string; now?: string } = {}): { record: IdentityRecord; keyFile: string } {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const { publicKey: pub, fingerprint, der } = publicMaterial(publicKey);
  // id is derived from the public key so it's stable + collision-resistant.
  const id = "agt_" + createHash("sha256").update(der).digest("hex").slice(0, 16);
  const now = opts.now ?? new Date().toISOString();
  const record: IdentityRecord = {
    id,
    algorithm: "ed25519",
    publicKey: pub,
    fingerprint,
    ...(opts.name ? { name: opts.name } : {}),
    createdAt: now,
    status: "active",
  };
  const pem = (privateKey.export({ type: "pkcs8", format: "pem" }) as string);
  const keyFile = writePrivateKey(store, id, pem);
  writeIdentity(store, record);
  appendAudit(store, { op: "mint", id, ts: now, fingerprint });
  return { record, keyFile };
}

/** Inspect an identity — verifies the on-disk private key matches the record's public key. */
export function inspectIdentity(store: IdentityStore, id: string, opts: { now?: string } = {}): IdentityRecord & { keyPresent: boolean; keyMatches: boolean } {
  const record = readIdentity(store, id);
  let keyPresent = false;
  let keyMatches = false;
  const kp = keyPath(store, id);
  if (existsSync(kp)) {
    keyPresent = true;
    try {
      const pub = createPublicKey({ key: readFileSync(kp, "utf-8") });
      keyMatches = publicMaterial(pub).publicKey === record.publicKey;
    } catch {
      keyMatches = false;
    }
  }
  appendAudit(store, { op: "inspect", id, ts: opts.now ?? new Date().toISOString() });
  return { ...record, keyPresent, keyMatches };
}

/**
 * Rotate an identity's key material in place: the id stays stable (so references
 * keep resolving) while the keypair is replaced. The old public key is archived
 * in previousKeys[] and the old private key is moved aside as `.revoked`.
 */
export function rotateIdentity(store: IdentityStore, id: string, opts: { now?: string } = {}): { record: IdentityRecord; keyFile: string } {
  const record = readIdentity(store, id);
  const now = opts.now ?? new Date().toISOString();

  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const { publicKey: pub, fingerprint } = publicMaterial(publicKey);

  // Archive the superseded private key (don't silently destroy it).
  const oldKey = keyPath(store, id);
  if (existsSync(oldKey)) {
    renameSync(oldKey, `${oldKey}.${now.replace(/[:.]/g, "-")}.revoked`);
  }

  const updated: IdentityRecord = {
    ...record,
    publicKey: pub,
    fingerprint,
    status: "active",
    previousKeys: [
      ...(record.previousKeys ?? []),
      { publicKey: record.publicKey, fingerprint: record.fingerprint, rotatedAt: now },
    ],
  };
  const pem = (privateKey.export({ type: "pkcs8", format: "pem" }) as string);
  const keyFile = writePrivateKey(store, id, pem);
  writeIdentity(store, updated);
  appendAudit(store, { op: "rotate", id, ts: now, fingerprint, supersededFingerprint: record.fingerprint });
  return { record: updated, keyFile };
}

// ── Formatters (secret-free) ─────────────────────────────────────────
export function formatIdentity(r: IdentityRecord): string {
  const lines = [
    `  id:          ${r.id}`,
    `  algorithm:   ${r.algorithm}`,
    `  fingerprint: ${r.fingerprint}`,
    `  status:      ${r.status}`,
    `  created:     ${r.createdAt}`,
  ];
  if (r.name) lines.splice(1, 0, `  name:        ${r.name}`);
  if (r.previousKeys?.length) lines.push(`  rotations:   ${r.previousKeys.length}`);
  return lines.join("\n");
}

export function registerIdentityCommand(program: Command): void {
  const identity = program
    .command("identity")
    .description("Mint, inspect, and rotate cross-product agent identities");

  identity
    .command("mint")
    .description("Mint a new ed25519 agent identity")
    .option("-n, --name <name>", "Human-friendly label for the identity")
    .option("--store <dir>", "Identity store root (default: ~/.agentkit or $AGENTKIT_HOME)")
    .action((opts) => {
      const store = resolveStore(opts.store);
      const { record, keyFile } = mintIdentity(store, { name: opts.name });
      console.log("✓ Minted identity\n");
      console.log(formatIdentity(record));
      console.log(`\n  private key: ${keyFile} (mode 0600 — keep secret, never commit)`);
    });

  identity
    .command("inspect <id>")
    .description("Inspect an identity (public material only; verifies the local key)")
    .option("--store <dir>", "Identity store root")
    .action((id, opts) => {
      const store = resolveStore(opts.store);
      try {
        const r = inspectIdentity(store, id);
        console.log(formatIdentity(r));
        console.log(`  publicKey:   ${r.publicKey}`);
        console.log(`  local key:   ${r.keyPresent ? (r.keyMatches ? "present, matches ✓" : "present, MISMATCH ✗") : "absent"}`);
      } catch (err) {
        console.error(`✗ ${err instanceof Error ? err.message : String(err)}`);
        process.exitCode = 1;
      }
    });

  identity
    .command("rotate <id>")
    .description("Rotate an identity's key material in place (id stays stable)")
    .option("--store <dir>", "Identity store root")
    .action((id, opts) => {
      const store = resolveStore(opts.store);
      try {
        const { record, keyFile } = rotateIdentity(store, id);
        console.log("✓ Rotated identity key\n");
        console.log(formatIdentity(record));
        console.log(`\n  new private key: ${keyFile} (mode 0600). Old key archived as .revoked.`);
      } catch (err) {
        console.error(`✗ ${err instanceof Error ? err.message : String(err)}`);
        process.exitCode = 1;
      }
    });
}
