export interface OrgAccount {
  organizationName: string;
  email?: string;
  password: string;
  createdAt: string;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));
}

export function readOrgAccount(raw: string | null): OrgAccount | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<OrgAccount>;
    if (
      typeof parsed.organizationName !== 'string' ||
      !parsed.organizationName.trim() ||
      typeof parsed.password !== 'string' ||
      !parsed.password ||
      typeof parsed.createdAt !== 'string'
    ) {
      return null;
    }

    return {
      organizationName: parsed.organizationName.trim(),
      email: typeof parsed.email === 'string' && parsed.email.trim()
        ? normalizeEmail(parsed.email)
        : undefined,
      password: parsed.password,
      createdAt: parsed.createdAt,
    };
  } catch {
    return null;
  }
}

export function credentialsMatch(account: OrgAccount, email: string, password: string): boolean {
  const emailMatches = !account.email || normalizeEmail(email) === account.email;
  return emailMatches && password === account.password;
}
