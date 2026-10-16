import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Page, TestInfo } from "@playwright/test";
import { expect, test } from "./api-fixture";

const apiUrl = "http://127.0.0.1:4000";
const environment = "env_service_config";
const observedPath = resolve("apps/api/data/e2e-service.observed.json");
const captureMilestonesEnabled = process.env.CONFIG_DRIFT_GUARD_DEMO_CAPTURE === "1";
const DEMO_HOLD_MS = 1200;

async function captureMilestone(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  if (!captureMilestonesEnabled) return;
  await page.screenshot({
    path: testInfo.outputPath(`milestone-${name}.png`),
    fullPage: true,
  });
  // Viewer pacing is separate from normal test assertions.
  await page.waitForTimeout(DEMO_HOLD_MS);
}

type SseProbe = { sources: Array<{ closeCalls: number }> };

declare global {
  interface Window {
    __sseProbe: SseProbe;
  }
}

async function instrumentSse(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const probe: SseProbe = { sources: [] };
    const entries = new WeakMap<EventSource, { closeCalls: number }>();
    (window as unknown as Window & { __sseProbe: SseProbe }).__sseProbe = probe;
    const OriginalEventSource = window.EventSource;
    window.EventSource = class extends OriginalEventSource {
      constructor(url: string | URL, options?: EventSourceInit) {
        super(url, options);
        const entry = { closeCalls: 0 };
        probe.sources.push(entry);
        entries.set(this, entry);
      }
      override close(): void {
        const entry = entries.get(this);
        if (entry !== undefined) entry.closeCalls += 1;
        super.close();
      }
    };
  });
}

async function expectNoSseLeak(page: Page): Promise<void> {
  await expect(page.getByText("Progress connection: closed")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const probe = (window as unknown as Window & { __sseProbe: SseProbe }).__sseProbe;
        return probe.sources.length > 0 && probe.sources.every((source) => source.closeCalls === 1);
      }),
    )
    .toBe(true);
}

async function scanToApproval(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Run drift scan" }).click();
  await expect(page.locator(".statusPill")).toHaveText("awaiting_approval");
  await expect(page.getByRole("button", { name: "Approve reconcile" })).toBeEnabled();
}

test.beforeEach(async ({ request }) => {
  const reset = await request.post(`${apiUrl}/api/environments/${environment}/reset`, {
    data: {},
  });
  expect(reset.status()).toBe(200);
});

test("browser scan, approval, verification and terminal SSE cleanup", async ({
  page,
}, testInfo) => {
  await instrumentSse(page);
  await page.goto("/");
  await captureMilestone(page, testInfo, "01-initial");
  await scanToApproval(page);
  await captureMilestone(page, testInfo, "02-awaiting-approval");
  await expect(page.getByText("Progress connection: live")).toBeVisible();
  await page.getByRole("button", { name: "Approve reconcile" }).click();
  await expect(page.locator(".statusPill")).toHaveText("succeeded");
  await captureMilestone(page, testInfo, "03-verified-convergence");
  await expectNoSseLeak(page);

  const resource = JSON.parse(readFileSync(observedPath, "utf8")) as {
    "api-service": { image: string; replicas: number; environment: { LOG_LEVEL: string } };
  };
  expect(resource["api-service"].image).toBe("api:v2");
  expect(resource["api-service"].replicas).toBe(3);
  expect(resource["api-service"].environment.LOG_LEVEL).toBe("info");
});

test("browser stale-plan failure keeps observed state and recovers with a new run", async ({
  page,
  request,
}, testInfo) => {
  await instrumentSse(page);
  await page.goto("/");
  await scanToApproval(page);
  await captureMilestone(page, testInfo, "04-stale-plan-before-change");
  const observed = JSON.parse(readFileSync(observedPath, "utf8")) as {
    "api-service": { image: string };
  };
  observed["api-service"].image = "api:v3";
  writeFileSync(observedPath, JSON.stringify(observed, null, 2));

  await page.getByRole("button", { name: "Approve reconcile" }).click();
  await expect(page.locator(".statusPill")).toHaveText("failed");
  await captureMilestone(page, testInfo, "05-stale-rejected");
  await expectNoSseLeak(page);
  const afterFailure = JSON.parse(readFileSync(observedPath, "utf8")) as {
    "api-service": { image: string };
  };
  expect(afterFailure["api-service"].image).toBe("api:v3");

  const reset = await request.post(`${apiUrl}/api/environments/${environment}/reset`, {
    data: {},
  });
  expect(reset.status()).toBe(200);
  await scanToApproval(page);
  await page.getByRole("button", { name: "Reject plan" }).click();
  await expect(page.locator(".statusPill")).toHaveText("rejected");
  await captureMilestone(page, testInfo, "06-operator-reject");
  await expectNoSseLeak(page);
});
