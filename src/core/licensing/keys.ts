/**
 * Cryptographic Public Key Configuration for Commercial Offline Licensing.
 * 
 * SECURITY MANDATE (Phase 7):
 * The customer-distributed application contains ONLY this public key for signature verification.
 * The corresponding Ed25519 Private Key is strictly held by the software vendor / distributor
 * in an offline license-generation tool (e.g., scripts/license-tool.mjs) and is NEVER distributed
 * to customers or bundled with the customer application package.
 */

export const DEFAULT_PLATFORM_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAdpnLyBO1nTfTFzM+h4HYFSVmeSkp/pmzD7MTW/c0eZc=
-----END PUBLIC KEY-----`;

/**
 * Retrieves the active Ed25519 public key used to verify commercial licenses.
 * Can be overridden in enterprise multi-tenant deployments via PLATFORM_LICENSE_PUBLIC_KEY.
 */
export function getPlatformPublicKey(): string {
  return process.env.PLATFORM_LICENSE_PUBLIC_KEY?.trim() || DEFAULT_PLATFORM_PUBLIC_KEY;
}
