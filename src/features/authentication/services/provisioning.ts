// SSO auto-provisioning decision (security finding F6, extends ADR-0005).
//
// Pure so it can be unit-tested without importing Auth.js/env. The signIn
// callback calls this to decide whether a *new* (not-yet-existing) SSO identity
// may be silently created as an org member.
//
// FAIL CLOSED: with no domain allowlist configured, auto-provisioning is OFF —
// SSO becomes invite-only (an unknown SSO user is rejected, not created), so a
// missing/forgotten config can never open public self-registration into the org.
// Auto-provisioning happens ONLY for emails whose domain is explicitly trusted
// via ALLOWED_EMAIL_DOMAINS. Already-existing users (invited, or created before
// a restriction) are unaffected — this governs creation of new accounts only.
export function canAutoProvisionSsoUser(
  email: string,
  allowedDomains: string[],
): boolean {
  if (allowedDomains.length === 0) return false;
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  return domain.length > 0 && allowedDomains.includes(domain);
}
