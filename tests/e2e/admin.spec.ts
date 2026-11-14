import { test, expect } from "@playwright/test";
import { E2E_EMAIL, E2E_PASSWORD } from "./constants.mjs";

/** Open a <details> section idempotently (it may already be open after a redirect). */
async function openSection(page: import("@playwright/test").Page, title: string) {
  await page
    .locator("details")
    .filter({ has: page.locator("summary", { hasText: title }) })
    .evaluate((el) => ((el as HTMLDetailsElement).open = true));
}

async function login(page: import("@playwright/test").Page, password = E2E_PASSWORD) {
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(E2E_EMAIL);
  await page.getByLabel("Kata sandi").fill(password);
  await page.getByRole("button", { name: "Masuk" }).click();
}

test("anonymous visitors are sent to the login page", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login$/);
  await expect(page.getByRole("heading", { name: "Masuk Admin" })).toBeVisible();
});

test("wrong password shows an error and grants nothing", async ({ page }) => {
  await login(page, "salah-total");
  await expect(page.locator(".flash.error")).toContainText("Email atau kata sandi salah");
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login$/);
});

test("Plt lifecycle: add -> not public -> verify -> public Plt -> end -> restored", async ({ page }) => {
  const name = `Uji E2E ${Date.now()}`;
  await login(page);
  await expect(page.getByRole("heading", { name: "Jabatan" })).toBeVisible();

  // 1) add a person
  await openSection(page, "Tambah orang");
  await page.getByLabel("Nama lengkap").fill(name);
  await page.getByRole("button", { name: "Simpan orang" }).click();
  await expect(page.getByRole("status")).toContainText("Orang ditambahkan");

  // 2) add a Plt assignment on Sekretaris Daerah
  await openSection(page, "Tambah penugasan");
  await page.locator('select[name="person_id"]').selectOption({ label: name });
  await page.locator('select[name="position_id"]').selectOption({ label: "Sekretaris Daerah" });
  await page.locator('select[name="assignment_type_code"]').selectOption("plt");
  await page.getByRole("button", { name: "Simpan penugasan" }).click();
  await expect(page.getByRole("status")).toContainText("Penugasan ditambahkan");

  // 3) unverified acting holder: public page still shows the definitif? No - no cross fallback.
  await page.goto("/pimpinan/sekretaris-daerah");
  await expect(page.getByText("Abdul Azis Hasan")).toHaveCount(0);
  await expect(page.getByText(name)).toHaveCount(0);

  // 4) verify the person and the assignment
  await page.goto("/admin");
  for (const target of [`Orang: ${name}`, `Penugasan: ${name} — Sekretaris Daerah`]) {
    await openSection(page, "Catat verifikasi");
    await page.locator('select[name="target"]').selectOption({ label: target });
    await page.locator('select[name="status"]').selectOption("verified");
    await page.getByRole("button", { name: "Catat verifikasi" }).click();
    await expect(page.getByRole("status")).toContainText("Verifikasi dicatat");
  }

  // 5) public page now shows the Plt (cache was revalidated)
  await page.goto("/pimpinan/sekretaris-daerah");
  await expect(page.getByText(name)).toBeVisible();
  await expect(page.getByText("Plt.").first()).toBeVisible();

  // 6) end the assignment -> back to the definitif holder
  await page.goto("/admin");
  const row = page.getByRole("row").filter({ hasText: name }).filter({ hasText: "active" });
  await row.getByRole("button", { name: "Akhiri" }).click();
  await expect(page.getByRole("status")).toContainText("Penugasan diakhiri");
  await page.goto("/pimpinan/sekretaris-daerah");
  await expect(page.getByText("Abdul Azis Hasan")).toBeVisible();
  await expect(page.getByText(name)).toHaveCount(0);
});

test("logout clears access", async ({ page }) => {
  await login(page);
  await page.getByRole("button", { name: "Keluar" }).click();
  await expect(page).toHaveURL(/\/admin\/login$/);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login$/);
});
