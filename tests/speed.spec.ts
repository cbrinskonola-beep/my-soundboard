import { test, expect } from "@playwright/test";
function tone() {
  const rate = 8000;
  const b = Buffer.alloc(44 + rate * 2 * 4);
  b.write("RIFF");
  b.writeUInt32LE(b.length - 8, 4);
  b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36);
  b.writeUInt32LE(b.length - 44, 40);
  for (let i = 0; i < rate * 4; i++)
    b.writeInt16LE(
      Math.round(Math.sin((i * 2 * Math.PI * 440) / rate) * 6000),
      44 + i * 2,
    );
  return b;
}
test("whole-board speed changes live sounds, new presses, and survives backups and reload", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Entire board 1.0×" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("button", { name: /Record performance|Play performance/ }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Create your first button" }).click();
  await page
    .locator('input[type=file][accept^="audio"]')
    .setInputFiles({ name: "tone.wav", mimeType: "audio/wav", buffer: tone() });
  await page.getByRole("button", { name: "Save to button" }).click();
  await page.getByLabel("Loop sound").check();
  await page.getByRole("button", { name: "Duplicate" }).click();
  await page.evaluate(() => {
    const original = HTMLMediaElement.prototype.play;
    (window as any).audios = [];
    (window as any).presses = [];
    HTMLMediaElement.prototype.play = function () {
      if (!(window as any).audios.includes(this))
        (window as any).audios.push(this);
      (window as any).presses.push({
        time: this.currentTime,
        rate: this.playbackRate,
      });
      return original.call(this);
    };
  });
  await page.getByRole("button", { name: "Entire board 0.5×" }).click();
  await page.getByRole("button", { name: "▷ Play", exact: true }).click();
  await page
    .locator(".pad")
    .first()
    .click({ position: { x: 15, y: 15 } });
  await page.locator(".pad").nth(1).click();
  await expect(page.locator(".playing")).toHaveCount(2);
  expect(
    await page.evaluate(() =>
      (window as any).audios.map((a: HTMLAudioElement) => a.playbackRate),
    ),
  ).toEqual([0.5, 0.5]);
  for (const speed of [1, 2, 4, 0.5]) {
    await page.waitForTimeout(100);
    const before = await page.evaluate(() =>
      (window as any).audios.map((a: HTMLAudioElement) => a.currentTime),
    );
    await page
      .getByRole("button", { name: `Entire board ${speed.toFixed(1)}×` })
      .click();
    expect(
      await page.evaluate(() =>
        (window as any).audios.map((a: HTMLAudioElement) => a.playbackRate),
      ),
    ).toEqual([speed, speed]);
    const after = await page.evaluate(() =>
      (window as any).audios.map((a: HTMLAudioElement) => a.currentTime),
    );
    after.forEach((v: number, i: number) =>
      expect(v).toBeGreaterThanOrEqual(before[i]),
    );
    await expect(page.locator(".playing")).toHaveCount(2);
  }
  await page.getByRole("button", { name: "Entire board 2.0×" }).click();
  await page
    .locator(".pad")
    .first()
    .click({ position: { x: 15, y: 15 } });
  expect(await page.evaluate(() => (window as any).presses.at(-1))).toEqual({
    time: 0,
    rate: 2,
  });
  await page.getByRole("button", { name: "Stop all sounds" }).click();
  expect(
    await page.evaluate(() =>
      (window as any).audios.every(
        (a: HTMLAudioElement) => a.paused && a.currentTime === 0,
      ),
    ),
  ).toBe(true);
  await expect(page.getByText("All changes saved")).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export", exact: false }).click();
  const path = await (await download).path();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Entire board 2.0×" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".pad")).toHaveCount(2);
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "New board", exact: false }).click();
  await expect(
    page.getByRole("button", { name: "Entire board 1.0×" }),
  ).toHaveAttribute("aria-pressed", "true");
  page.once("dialog", (d) => d.accept());
  await page
    .locator('input[accept="application/json,.json"]')
    .setInputFiles(path!);
  await expect(
    page.getByRole("button", { name: "Entire board 2.0×" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".pad")).toHaveCount(2);
  // Old backups omitted speed and must still import at normal speed.
  const data = {
    version: 1,
    board: {
      name: "Legacy board",
      pads: [],
      width: 1600,
      height: 1000,
      zoom: 1,
      snap: false,
    },
    sounds: [],
  };
  page.once("dialog", (d) => d.accept());
  await page
    .locator('input[accept="application/json,.json"]')
    .setInputFiles({
      name: "legacy.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(data)),
    });
  await expect(
    page.getByRole("button", { name: "Entire board 1.0×" }),
  ).toHaveAttribute("aria-pressed", "true");
});
