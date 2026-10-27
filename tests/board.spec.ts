import { test, expect } from "@playwright/test";
const wav = () => {
  const b = Buffer.alloc(44 + 16000);
  b.write("RIFF");
  b.writeUInt32LE(b.length - 8, 4);
  b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(8000, 24);
  b.writeUInt32LE(16000, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36);
  b.writeUInt32LE(16000, 40);
  return b;
};
test("canvas editing, dragging, resizing, shapes, layers and restore", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create your first button" }).click();
  await page.getByLabel("Label", { exact: true }).fill("Applause");
  await page.getByLabel("Shape", { exact: true }).selectOption("circle");
  await expect(page.locator(".pad")).toHaveClass(/circle/);
  const before = await page.locator(".pad").boundingBox();
  await page.locator(".pad").hover();
  await page.mouse.down();
  await page.mouse.move(
    before!.x + before!.width / 2 + 80,
    before!.y + before!.height / 2 + 50,
  );
  await page.mouse.up();
  await expect(page.getByLabel("X", { exact: true })).toHaveValue("130");
  const handle = await page
    .getByRole("button", { name: "Resize button" })
    .boundingBox();
  await page.mouse.move(handle!.x + 10, handle!.y + 10);
  await page.mouse.down();
  await page.mouse.move(handle!.x + 40, handle!.y + 40);
  await page.mouse.up();
  await expect(page.getByLabel("Width", { exact: true })).toHaveValue("200");
  await expect(page.getByLabel("Height", { exact: true })).toHaveValue("200");
  await page.getByRole("button", { name: "Duplicate" }).click();
  await expect(page.locator(".pad")).toHaveCount(2);
  await page.getByRole("button", { name: "Send back" }).click();
  await expect(page.locator(".pad").first()).toHaveAttribute(
    "aria-label",
    "Applause copy",
  );
  await expect(page.getByText("All changes saved")).toBeVisible();
  await page.reload();
  await expect(page.locator(".pad")).toHaveCount(2);
  await page.getByRole("button", { name: "▷ Play", exact: true }).click();
  await expect(page.locator("aside")).toHaveCount(0);
  await expect(page.locator(".resize")).toHaveCount(0);
});
test("upload, same-button restart, simultaneous playback, stop and backups", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create your first button" }).click();
  await page
    .locator('input[type=file][accept^="audio"]')
    .setInputFiles({ name: "test.wav", mimeType: "audio/wav", buffer: wav() });
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Save to button" }).click();
  await expect(page.getByLabel("Assigned sound")).toHaveValue(/.+/);
  await page.getByRole("button", { name: "Duplicate" }).click();
  await page.evaluate(() => {
    const original = HTMLMediaElement.prototype.play;
    (window as any).plays = [];
    HTMLMediaElement.prototype.play = function () {
      (window as any).plays.push({
        time: this.currentTime,
        sound: this.dataset.sound,
      });
      return original.call(this);
    };
  });
  await page.getByRole("button", { name: "▷ Play", exact: true }).click();
  await page
    .locator(".pad")
    .first()
    .click({ position: { x: 15, y: 15 } });
  await page.waitForTimeout(250);
  await page
    .locator(".pad")
    .first()
    .click({ position: { x: 15, y: 15 } });
  await page.locator(".pad").nth(1).click();
  expect(
    await page.evaluate(() => (window as any).plays.map((p: any) => p.time)),
  ).toEqual([0, 0, 0]);
  await expect(page.locator(".pad.playing")).toHaveCount(2);
  await page.getByRole("button", { name: "Stop all sounds" }).click();
  await expect(page.locator(".playing")).toHaveCount(0);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export", exact: false }).click();
  const d = await download;
  const path = await d.path();
  expect(path).toBeTruthy();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "New board", exact: false }).click();
  await expect(page.locator(".pad")).toHaveCount(0);
  page.once("dialog", (d) => d.accept());
  await page
    .locator('input[accept="application/json,.json"]')
    .setInputFiles(path!);
  await expect(page.locator(".pad")).toHaveCount(2);
  await expect(page.getByText("All changes saved")).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "▷ Play", exact: true }).click();
  await page
    .locator(".pad")
    .first()
    .click({ position: { x: 15, y: 15 } });
  await expect(page.locator(".playing")).toHaveCount(1);
});
test("recording lifecycle using a browser microphone", async ({ browser }) => {
  const context = await browser.newContext({ permissions: ["microphone"] });
  const page = await context.newPage();
  await page.goto("/");
  await page.getByRole("button", { name: "Create your first button" }).click();
  await page
    .getByRole("button", { name: "Record sound", exact: false })
    .click();
  await page.getByRole("button", { name: "Start recording" }).click();
  await expect(page.getByText("Recording…", { exact: true })).toBeVisible();
  await page.waitForTimeout(1100);
  await page.getByRole("button", { name: "Stop recording" }).click();
  await expect(page.locator("audio")).toBeVisible();
  await page.getByRole("button", { name: "Save to button" }).click();
  await expect(
    page.getByLabel("Assigned sound").locator("option:checked"),
  ).toContainText("Recording");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export", exact: false }).click();
  const backup = await (await download).path();
  page.once("dialog", (d) => d.accept());
  await page
    .locator('input[accept="application/json,.json"]')
    .setInputFiles(backup!);
  await expect(page.getByText("All changes saved")).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "▷ Play", exact: true }).click();
  await page.locator(".pad").click();
  await expect(page.locator(".playing")).toHaveCount(1);
  await context.close();
});
test("mobile preserves layout, zoom and offline reload", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await page.goto("/");
  await page.getByRole("button", { name: "Create your first button" }).click();
  await page.getByRole("button", { name: "▷ Play", exact: true }).click();
  await expect(page.locator(".padwrap")).toHaveCSS("width", "170px");
  await page.getByRole("button", { name: "Zoom in" }).click();
  await expect(page.getByRole("button", { name: "Reset zoom" })).toHaveText(
    "110%",
  );
  await page.getByRole("button", { name: "Reset zoom" }).click();
  await expect(page.locator(".padwrap")).toHaveCSS("width", "170px");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect(page.locator(".saved")).toHaveText("● All changes saved");
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator(".pad")).toHaveCount(1);
  await context.close();
});

test("permission denial and malformed backups preserve the current board", async ({
  page,
}) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException("Microphone permission denied", "NotAllowedError");
    };
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Create your first button" }).click();
  await page
    .getByRole("button", { name: "Record sound", exact: false })
    .click();
  await page.getByRole("button", { name: "Start recording" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Microphone permission denied",
  );
  await page.getByRole("button", { name: "Cancel sound" }).click();
  await page
    .locator('input[accept="application/json,.json"]')
    .setInputFiles({
      name: "broken.json",
      mimeType: "application/json",
      buffer: Buffer.from('{"version":1,"board":{}}'),
    });
  await expect(page.getByRole("alert")).toContainText("Invalid");
  await expect(page.locator(".pad")).toHaveCount(1);
});
