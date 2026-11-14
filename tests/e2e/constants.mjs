// Shared by the mock auth server, Playwright config and specs (E2E only).
export const MOCK_AUTH_PORT = process.env.MOCK_AUTH_PORT ?? "54399";
export const MOCK_AUTH_URL = `http://127.0.0.1:${MOCK_AUTH_PORT}`;
export const E2E_JWT_SECRET = "e2e-only-secret-not-used-anywhere-else-0123456789";
export const E2E_SUB = "11111111-1111-4111-8111-111111111111";
export const E2E_EMAIL = "admin@setda.test";
export const E2E_PASSWORD = "e2e-password-123";
