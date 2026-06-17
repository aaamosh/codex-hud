import { expect, test } from "@playwright/test";

test("admin dashboard renders operational controls", async ({ page }) => {
  const token = process.env.ADMIN_TOKEN ?? "dev-admin-token";
  await page.goto(`/admin?token=${encodeURIComponent(token)}`);

  await expect(page.getByRole("heading", { name: "codex-buddy admin" })).toBeVisible();
  await expect(page.getByText("Masked email only")).toBeVisible();
  await expect(page.getByRole("link", { name: "JSON export" })).toBeVisible();
  await expect(page.getByRole("link", { name: "CSV export" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save config" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Giver offers" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Seeker requests" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Matches" })).toBeVisible();

  const hasPageOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(hasPageOverflow).toBe(false);
});

test("admin dashboard keeps populated mobile content inside page bounds", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes("mobile"), "mobile overflow guard");
  const token = process.env.ADMIN_TOKEN ?? "dev-admin-token";
  await page.goto(`/admin?token=${encodeURIComponent(token)}`);
  await page.evaluate(() => {
    const matchBody = document.querySelector("section:last-of-type tbody");
    if (!matchBody) return;
    matchBody.innerHTML = `
      <tr>
        <td><code>admin-demo-match-with-long-id</code></td>
        <td>admin_resolved</td>
        <td>900001</td>
        <td>900003</td>
        <td>tw***o@e***e.com</td>
        <td>admin_resolved</td>
        <td class="actions"><button>Cancel</button><button>Resolve</button><button>Block seeker</button></td>
      </tr>`;
  });

  const hasPageOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(hasPageOverflow).toBe(false);
});
