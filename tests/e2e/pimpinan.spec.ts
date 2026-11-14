import { test, expect } from "@playwright/test";

test("public /pimpinan lists the eligible officials", async ({ page }) => {
  await page.goto("/pimpinan");
  await expect(
    page.getByRole("heading", { name: "Pimpinan & Pejabat" }),
  ).toBeVisible();
  await expect(page.getByText("Abdul Azis Hasan")).toBeVisible();
  await expect(page.getByText("dr. H. Khairul, M.Kes.")).toBeVisible();
  await expect(page.getByText("Ibnu Saud IS")).toBeVisible();
});

test("position page is position-anchored and shows the current holder", async ({
  page,
}) => {
  await page.goto("/pimpinan/sekretaris-daerah");
  await expect(
    page.getByRole("heading", { name: "Sekretaris Daerah" }),
  ).toBeVisible();
  await expect(page.getByText("Abdul Azis Hasan")).toBeVisible();
});

test("unknown position returns 404", async ({ page }) => {
  const res = await page.goto("/pimpinan/tidak-ada");
  expect(res?.status()).toBe(404);
});
