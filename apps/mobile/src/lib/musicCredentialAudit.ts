type AuditDetails = Record<string, unknown>;

function shouldRedactKey(key: string): boolean {
  return /token|secret|authorization|bearer|jwt|private|anon/i.test(key);
}

function redactValue(value: unknown, key = ""): unknown {
  if (shouldRedactKey(key)) {
    if (typeof value === "string") return value ? "[present]" : "[empty]";
    if (typeof value === "boolean" || typeof value === "number") return value;
    return value == null ? value : "[present]";
  }
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) return value.map((entry) => redactValue(entry, key));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        redactValue(entry, key),
      ]),
    );
  }
  return value;
}

export function auditMusicCredentials(
  event: string,
  details: AuditDetails = {},
): void {
  console.info("[mix-credential-audit]", event, redactValue(details));
}

export function auditMusicCredentialWarning(
  event: string,
  details: AuditDetails = {},
): void {
  console.warn("[mix-credential-audit]", event, redactValue(details));
}
