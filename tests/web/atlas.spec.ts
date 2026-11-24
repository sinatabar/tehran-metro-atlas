import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("opens Persian map, changes language, explores a named future line", async ({
  page,
}, info) => {
  await page.goto("./");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await page.getByRole("button", { name: "English", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  if (info.project.name.includes("mobile"))
    await page.getByRole("button", { name: "Explore network" }).click();
  await page
    .getByRole("button", { name: "Future network", exact: true })
    .click();
  await page.locator(".line-row a").filter({ hasText: "Line 10" }).click();
  await expect(page.locator(".detail h1")).toContainText("Line 10");
  await expect(page.locator(".detail")).toContainText("Under construction");
  await expect(page.locator(".detail")).toContainText(
    "No publishable geometry",
  );
  await expect(page.locator(".detail .source-list a").first()).toBeVisible();
  await page.reload();
  await expect(page.locator(".detail h1")).toContainText("Line 10");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("finds landmarks and distinguishes nearby passenger stations", async ({
  page,
}) => {
  await page.goto("en/directory/");
  await page.getByRole("button", { name: /Places/ }).click();
  await page.getByRole("searchbox").fill("Parkway");
  await page.locator(".result").filter({ hasText: "Parkway" }).first().click();
  await expect(page.locator(".detail h1")).toContainText("Parkway");
  await expect(
    page.getByText("Nearby stations", { exact: true }),
  ).toBeVisible();
  await page.locator(".detail a.nearby").first().click();
  await expect(page.locator(".facts")).toContainText("Location confidence");
  await expect(page).toHaveURL(/\/stations\//);
});

test("renders local geography, filters actual MapLibre features and persists position", async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== "chromium",
    "Authoritative WebGL render check runs on Chromium with software GL.",
  );
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("en/");
  await expect(page.locator(".map-labels .line-label").first()).toBeVisible();
  await expect(page.locator(".district").first()).toBeVisible();
  const before = await page.locator(".map-labels .line-label").count();
  await page.getByRole("button", { name: "Layers", exact: true }).click();
  await page
    .getByRole("checkbox", { name: "Operational", exact: true })
    .uncheck();
  await expect(page.locator(".map-labels .line-label")).toHaveCount(0);
  await page
    .getByRole("checkbox", { name: "Operational", exact: true })
    .check();
  await expect(page.locator(".map-labels .line-label")).toHaveCount(before);
  await page.getByRole("button", { name: "Close", exact: true }).click();
  const first = page.getByRole("button", {
    name: "Show on map · Line 1",
    exact: true,
  });
  await first.click();
  await expect(first).toHaveAttribute("aria-pressed", "false");
  await page
    .getByRole("button", { name: "Toggle light and dark theme" })
    .click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator(".map-labels .line-label").first()).toBeVisible();
  await page.getByRole("button", { name: "Zoom in" }).click();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("view"))
    .toMatch(/,11\.85$/);
  await page.getByRole("button", { name: "Toggle fullscreen" }).click();
  await expect(page.locator(".map-frame")).toHaveClass(/expanded/);
  await page.keyboard.press("Escape");
  expect(errors).toEqual([]);
});

test("opens the source registry and retrieves every export", async ({
  page,
  request,
}) => {
  await page.goto("en/methodology/");
  await expect(
    page.getByRole("heading", { name: "Sources and methodology" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Download data", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  const links = await dialog
    .locator(".download-group a")
    .evaluateAll((links) => links.map((l) => (l as HTMLAnchorElement).href));
  expect(links).toHaveLength(8);
  for (const link of links) {
    const r = await request.get(link);
    expect(r.ok()).toBe(true);
    expect((await r.body()).length).toBeGreaterThan(100);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
});

test("offers a keyboard accessible directory and map shell", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "chromium");
  for (const route of ["en/", "fa/directory/"]) {
    await page.goto(route);
    await expect(page.getByRole("searchbox")).toBeVisible();
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(
      result.violations.map((v) => [
        v.id,
        v.nodes.map((n) => n.target).slice(0, 4),
      ]),
    ).toEqual([]);
  }
});

test("saves and opens the reviewed atlas offline", async ({
  page,
  context,
}, info) => {
  test.skip(info.project.name !== "chromium");
  await page.goto("en/");
  await page
    .getByRole("button", { name: "Download data", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Save atlas for offline use" })
    .click();
  await expect(
    page.getByText("Offline copy ready", { exact: true }),
  ).toBeVisible({ timeout: 20000 });
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator(".map-labels .line-label").first()).toBeVisible();
  await page.getByRole("link", { name: "Directory", exact: true }).click();
  await expect(page.getByRole("searchbox")).toBeVisible();
});

test("selects the mapped station by clicking its projected location", async ({
  page,
  request,
}, info) => {
  test.skip(info.project.name !== "chromium");
  const a = await (await request.get("data/atlas.json")).json();
  const station = a.stations.find(
    (s: { status: string; interchange: boolean; geometry: unknown }) =>
      s.status === "operational" && s.geometry && !s.interchange,
  );
  await page.goto("en/stations/" + station.id + "/");
  await expect(page.locator(".map-labels .selected-label")).toBeVisible();
  // The detail view centres the selected representative point. Returning to the
  // overview leaves the map at that location, so the click tests rendered picking.
  await page.getByRole("button", { name: "Network overview" }).click();
  const map = page.getByTestId("network-map"),
    box = await map.boundingBox();
  if (!box) throw Error("Map has no rendered bounds");
  await map.click({
    position: { x: Math.round(box.width / 2), y: Math.round(box.height / 2) },
  });
  await expect(page.locator(".detail h1")).toHaveText(station.name.en);
});

test("publishes crawlable bilingual station records without JavaScript", async ({
  request,
}) => {
  const a = await (await request.get("data/atlas.json")).json();
  const station = a.stations.find(
    (s: { status: string }) => s.status === "operational",
  );
  const response = await request.get("fa/stations/" + station.id + "/");
  expect(response.ok()).toBe(true);
  const html = await response.text();
  expect(html).toContain("<h1>" + station.name.fa + "</h1>");
  expect(html).toContain('rel="canonical"');
  expect(html).toContain('"@type":"TrainStation"');
  expect(await (await request.get("sitemap.xml")).text()).toContain(
    "/en/stations/" + station.id + "/",
  );
});
