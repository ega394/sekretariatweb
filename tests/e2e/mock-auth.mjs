// Minimal stand-in for Supabase Auth's password grant, for E2E only.
// POST /auth/v1/token?grant_type=password  ->  HS256 JWT like Supabase issues.
import http from "node:http";
import { SignJWT } from "jose";
import { MOCK_AUTH_PORT, MOCK_AUTH_URL, E2E_JWT_SECRET, E2E_SUB, E2E_EMAIL, E2E_PASSWORD } from "./constants.mjs";

const key = new TextEncoder().encode(E2E_JWT_SECRET);

http
  .createServer(async (req, res) => {
    const send = (code, body) => {
      res.writeHead(code, { "Content-Type": "application/json" });
      res.end(JSON.stringify(body));
    };
    if (req.method === "GET" && req.url === "/health") return send(200, { ok: true });
    if (req.method === "POST" && req.url?.startsWith("/auth/v1/token")) {
      let raw = "";
      for await (const c of req) raw += c;
      let body = {};
      try { body = JSON.parse(raw); } catch {}
      if (body.email !== E2E_EMAIL || body.password !== E2E_PASSWORD) {
        return send(400, { error: "invalid_grant", error_description: "Invalid login credentials" });
      }
      const token = await new SignJWT({ email: E2E_EMAIL })
        .setProtectedHeader({ alg: "HS256" })
        .setSubject(E2E_SUB)
        .setAudience("authenticated")
        .setIssuer(`${MOCK_AUTH_URL}/auth/v1`)
        .setIssuedAt()
        .setExpirationTime("1h")
        .sign(key);
      return send(200, { access_token: token, token_type: "bearer", expires_in: 3600 });
    }
    send(404, { error: "not_found" });
  })
  .listen(Number(MOCK_AUTH_PORT), "127.0.0.1", () => console.log("mock auth on " + MOCK_AUTH_PORT));
