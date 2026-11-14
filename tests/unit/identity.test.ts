import { describe, it, expect } from "vitest";
import { SignJWT } from "jose";
import { SupabaseIdentityProvider } from "@/auth/identity";

const URL_ = "https://abc.supabase.co";
const SECRET = "unit-test-secret-that-is-long-enough-32+";
const key = new TextEncoder().encode(SECRET);

async function token(opts: {
  secret?: Uint8Array;
  aud?: string;
  iss?: string;
  exp?: string | number;
  sub?: string | null;
} = {}) {
  const jwt = new SignJWT({ email: "admin@setda.test" })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience(opts.aud ?? "authenticated")
    .setIssuer(opts.iss ?? `${URL_}/auth/v1`)
    .setIssuedAt()
    .setExpirationTime(opts.exp ?? "1h");
  if (opts.sub !== null) jwt.setSubject(opts.sub ?? "user-123");
  return jwt.sign(opts.secret ?? key);
}

const provider = new SupabaseIdentityProvider({ url: URL_, anonKey: "anon", jwtSecret: SECRET });

describe("SupabaseIdentityProvider.verify", () => {
  it("accepts a valid token and returns the subject + email", async () => {
    expect(await provider.verify(await token())).toEqual({
      externalId: "user-123",
      email: "admin@setda.test",
    });
  });
  it("rejects a token signed with another secret", async () => {
    const bad = await token({ secret: new TextEncoder().encode("another-secret-another-secret-123456") });
    expect(await provider.verify(bad)).toBeNull();
  });
  it("rejects an expired token", async () => {
    expect(await provider.verify(await token({ exp: Math.floor(Date.now() / 1000) - 60 }))).toBeNull();
  });
  it("rejects the wrong audience and the wrong issuer", async () => {
    expect(await provider.verify(await token({ aud: "anon" }))).toBeNull();
    expect(await provider.verify(await token({ iss: "https://evil.example/auth/v1" }))).toBeNull();
  });
  it("rejects a token without subject and garbage input", async () => {
    expect(await provider.verify(await token({ sub: null }))).toBeNull();
    expect(await provider.verify("not-a-jwt")).toBeNull();
  });
});

describe("SupabaseIdentityProvider.signIn", () => {
  const mk = (status: number, body: unknown) =>
    new SupabaseIdentityProvider({
      url: URL_,
      anonKey: "anon",
      jwtSecret: SECRET,
      fetchImpl: (async () => new Response(JSON.stringify(body), { status })) as typeof fetch,
    });

  it("returns the token on success", async () => {
    const r = await mk(200, { access_token: "tok", expires_in: 1800 }).signIn("a@b.c", "pw");
    expect(r).toEqual({ accessToken: "tok", expiresIn: 1800 });
  });
  it("returns null for wrong credentials", async () => {
    expect(await mk(400, { error: "invalid_grant" }).signIn("a@b.c", "bad")).toBeNull();
  });
  it("throws on a service outage (never reported as wrong password)", async () => {
    await expect(mk(503, {}).signIn("a@b.c", "pw")).rejects.toThrow(/Auth service error/);
  });
});
