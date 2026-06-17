const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(normalizeEmail(email));
}

export function maskEmail(email: string): string {
  const normalized = normalizeEmail(email);
  const [local, domain = ""] = normalized.split("@");
  if (!local || !domain) return "***";
  const visibleLocal = local.length <= 2 ? `${local[0] ?? "*"}*` : `${local.slice(0, 2)}***${local.slice(-1)}`;
  const [domainName, ...suffixParts] = domain.split(".");
  const suffix = suffixParts.join(".");
  const visibleDomain =
    domainName.length <= 2 ? `${domainName[0] ?? "*"}*` : `${domainName.slice(0, 1)}***${domainName.slice(-1)}`;
  return `${visibleLocal}@${visibleDomain}${suffix ? `.${suffix}` : ""}`;
}

export async function hashEmail(email: string, pepper: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    utf8(pepper),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, utf8(normalizeEmail(email)));
  return hex(new Uint8Array(signature));
}

export async function encryptEmail(email: string, secret: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await importAesKey(secret);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    utf8(normalizeEmail(email))
  );
  return `v1:${bytesToBase64(iv)}:${bytesToBase64(new Uint8Array(ciphertext))}`;
}

export async function decryptEmail(ciphertext: string, secret: string): Promise<string> {
  const [version, ivRaw, bodyRaw] = ciphertext.split(":");
  if (version !== "v1" || !ivRaw || !bodyRaw) {
    throw new Error("Unsupported email ciphertext format");
  }
  const key = await importAesKey(secret);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(ivRaw) },
    key,
    base64ToBytes(bodyRaw)
  );
  return new TextDecoder().decode(plaintext);
}

async function importAesKey(secret: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest("SHA-256", utf8(secret));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

function utf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function hex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

