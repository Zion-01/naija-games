import { expect, test, type Page } from "@playwright/test";

/** The cards in this page's hand, as their accessible labels ("Play circle 10"). */
const hand = (page: Page) => page.getByRole("button", { name: /^Play / }).evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")!));

test("two players share a private Whot room by invite link", async ({ browser }) => {
  const host = await (await browser.newContext()).newPage();
  await host.goto("/whot");
  await host.getByRole("button", { name: "🌍 Online" }).click();
  await host.getByLabel("Wetin we go call you?").fill("Tunde");
  await host.getByRole("button", { name: /Invite your guy/ }).click();
  await host.waitForURL(/\/play\/[A-Z]{4}$/);
  const code = host.url().split("/").pop()!;
  await expect(host.getByText(code, { exact: true })).toBeVisible();
  await expect(host.getByText("Waiting for your guy…")).toBeVisible();

  // The link preview names the host.
  const html = await (await host.request.get(`/play/${code}`)).text();
  expect(html).toContain("Tunde don challenge you for Whot!");
  const og = await host.request.get(`/play/${code}/opengraph-image`);
  expect(og.headers()["content-type"]).toBe("image/png");

  const guestContext = await browser.newContext();
  let guest = await guestContext.newPage();
  await guest.goto(`/play/${code}`);
  await guest.getByLabel("Wetin we go call you?").fill("Bisi");
  await guest.getByRole("button", { name: "Join", exact: true }).click();

  // Both tables are dealt, and each player only sees their own five cards.
  await expect(host.getByText("Your cards · 5")).toBeVisible();
  await expect(guest.getByText("Your cards · 5")).toBeVisible();
  const [mine, theirs] = [await hand(host), await hand(guest)];
  expect(mine).toHaveLength(5);
  const shared = mine.filter((label) => label !== "Play Whot 20" && theirs.includes(label));
  expect(shared).toEqual([]);

  // The host starts: going to market shows up on the guest's table.
  await expect(host.getByText("Your turn")).toBeVisible();
  await host.getByRole("button", { name: "Go market" }).click();
  await expect(guest.getByText("6 cards")).toBeVisible();
  await expect(guest.getByText("Your turn")).toBeVisible();

  // Banter: the guest's emote pops up on the host's table.
  await guest.getByRole("button", { name: "Emotes" }).click();
  await guest.getByRole("button", { name: "Na fire!" }).click();
  await expect(host.getByText("Na fire!")).toBeVisible();
  await expect(guest.getByText("Na fire!")).toBeVisible();

  // The guest's phone drops: the host sees them offline, and they get their seat back from the same link.
  await guest.close();
  await expect(host.getByTitle("Offline")).toBeVisible({ timeout: 10_000 });
  guest = await guestContext.newPage();
  await guest.goto(`/play/${code}`);
  await guest.getByRole("button", { name: "Join as Bisi" }).click();
  await expect(guest.getByText("Your cards · 5")).toBeVisible();
  await expect(host.getByTitle("Offline")).toHaveCount(0);
  expect(await hand(guest)).toEqual(theirs);
});

test("the host can start an Ayo room against the computer", async ({ page }) => {
  await page.goto("/ayo");
  await page.getByRole("button", { name: "🌍 Online" }).click();
  await page.getByLabel("Wetin we go call you?").fill("Ada");
  await page.getByRole("button", { name: /Invite your guy/ }).click();
  await page.waitForURL(/\/play\/[A-Z]{4}$/);
  await page.getByRole("button", { name: "Play the computer instead" }).click();
  const pits = page.getByRole("button", { name: /tap to sow/ });
  await expect(pits).toHaveCount(6);
  await pits.first().click();
  // Seeds go round, the computer answers, and it's your turn again.
  await expect(pits).toHaveCount(0);
  await expect(page.getByText(/Your turn · \d+s/)).toBeVisible({ timeout: 10_000 });
  await expect(pits.first()).toBeVisible();
});
