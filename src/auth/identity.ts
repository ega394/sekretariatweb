import "server-only";
import { createRemoteJWKSet, jwtVerify } from "jose";

/**
 * Identity port (Authentication) — separate from Authorization (RBAC).
 *
 * The application depends on `IdentityProvider`, never on Supabase specifics.
 * Swapping the provider (Supabase Auth <-> OIDC/SSO Pemkot/local) only means
 * providing another implementation that yields an `ExternalIdentity`.
 * Authorization always comes from our own users + RBAC tables, mapped through
 * `users.external_auth_id` (see src/auth/users.ts).
 */
export interface ExternalIdentity {
  externalId: string;
  email: string | null;
}

export interface SignInResult {
  accessToken: string;
  /** seconds until the access token expires */
  expiresIn: number;
}

export interface IdentityProvider {
  /** Exchange credentials for an access token; null = wrong credentials. */
  signIn(email: string, password: string): Promise<SignInResult | null>;
  /** Cryptographically verify a token; null = invalid/expired. */
  verify(token: string): Promise<ExternalIdentity | null>;
}

export class IdentityConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IdentityConfigError";
  }
}

export interface SupabaseIdentityConfig {
  /** e.g. https://<ref>.supabase.co (no trailing slash) */
  url: string;
  /** publishable/anon key — only used to call the Auth API */
  anonKey: string;
  /**
   * Legacy HS256 JWT secret. When absent, tokens are verified against the
   * project's public JWKS (asymmetric signing keys).
   */
  jwtSecret?: string;
  fetchImpl?: typeof fetch;
}

export class SupabaseIdentityProvider implements IdentityProvider {
  private readonly url: string;
  private jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

  constructor(private readonly cfg: SupabaseIdentityConfig) {
    this.url = cfg.url.replace(/\/+$/, "");
  }

  async signIn(email: string, password: string): Promise<SignInResult | null> {
    const doFetch = this.cfg.fetchImpl ?? fetch;
    const res = await doFetch(`${this.url}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: this.cfg.anonKey, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
      cache: "no-store",
    });
    // 400/401/422 = bad credentials; anything else is an outage -> surface it.
    if (res.status === 400 || res.status === 401 || res.status === 422) return null;
    if (!res.ok) throw new Error(`Auth service error (${res.status})`);
    const data = (await res.json()) as {
      access_token?: unknown;
      expires_in?: unknown;
    };
    if (typeof data.access_token !== "string") return null;
    return {
      accessToken: data.access_token,
      expiresIn: Number(data.expires_in) > 0 ? Number(data.expires_in) : 3600,
    };
  }

  async verify(token: string): Promise<ExternalIdentity | null> {
    const options = {
      audience: "authenticated",
      issuer: `${this.url}/auth/v1`,
    };
    try {
      const { payload } = this.cfg.jwtSecret
        ? await jwtVerify(token, new TextEncoder().encode(this.cfg.jwtSecret), {
            ...options,
            algorithms: ["HS256"],
          })
        : await jwtVerify(token, this.getJwks(), {
            ...options,
            algorithms: ["ES256", "RS256"],
          });
      if (typeof payload.sub !== "string" || payload.sub.length === 0) return null;
      return {
        externalId: payload.sub,
        email: typeof payload.email === "string" ? payload.email : null,
      };
    } catch {
      return null; // bad signature, expired, wrong audience/issuer, ...
    }
  }

  private getJwks() {
    this.jwks ??= createRemoteJWKSet(
      new URL(`${this.url}/auth/v1/.well-known/jwks.json`),
    );
    return this.jwks;
  }
}

let _provider: IdentityProvider | null = null;

/** Default provider for the MVP = Supabase Auth, configured from env. */
export function getIdentityProvider(): IdentityProvider {
  if (_provider) return _provider;
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new IdentityConfigError(
      "Autentikasi belum dikonfigurasi (SUPABASE_URL dan SUPABASE_ANON_KEY).",
    );
  }
  _provider = new SupabaseIdentityProvider({
    url,
    anonKey,
    jwtSecret: process.env.SUPABASE_JWT_SECRET || undefined,
  });
  return _provider;
}
