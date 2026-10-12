import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, type Page, test } from "@playwright/test";

const apiUrl = "http://127.0.0.1:4000";
const environment = "env_service_config";
const observedPath = resolve("apps/api/data/e2e-service.observed.json");

type SseProbe = { created: number; closed: number };

async function instrumentSse(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const probe: SseProbe = { created: 0, closed: 0 };
    (window as Window & { __sseProbe: SseProbe }).__sseProbe = probe;
    const OriginalEventSource = window.EventSource;
    window.EventSource = class extends OriginalEventSource {
      constructor(url: string | URL, options?: EventSourceInit) {
        super(url, options);
        probe.created += 1;
      }
      override close(): void {
        probe.closed += 1;
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
        const probe = (window as Window & { __sseProbe: SseProbe }).__sseProbe;
        return probe.created > 0 && probe.closed >= probe.created;
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

test("browser scan, approval, verification and terminal SSE cleanup", async ({ page }) => {
  await instrumentSse(page);
  await page.goto("/");
  await scanToApproval(page);
  await expect(page.getByText("Progress connection: live")).toBeVisible();
  await page.getByRole("button", { name: "Approve reconcile" }).click();
  await expect(page.locator(".statusPill")).toHaveText("succeeded");
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
}) => {
  await instrumentSse(page);
  await page.goto("/");
  await scanToApproval(page);
  const observed = JSON.parse(readFileSync(observedPath, "utf8")) as {
    "api-service": { image: string };
  };
  observed["api-service"].image = "api:v3";
  writeFileSync(observedPath, JSON.stringify(observed, null, 2));

  await page.getByRole("button", { name: "Approve reconcile" }).click();
  await expect(page.locator(".statusPill")).toHaveText("failed");
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
  await expectNoSseLeak(page);
});
