import { test, expect } from "@playwright/test";
function tone(freq = 440) {
  const rate = 16000;
  const b = Buffer.alloc(44 + rate * 2 * 3);
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
  for (let i = 0; i < rate * 3; i++)
    b.writeInt16LE(
      Math.round(Math.sin((i * 2 * Math.PI * freq) / rate) * 6000),
      44 + i * 2,
    );
  return b;
}
test("record mixed audio with silence, restore it and play the whole take at all speeds", async ({
  page,
}) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw Error("Performance recorder must not ask for a microphone");
    };
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Create your first button" }).click();
  await page
    .locator('input[type=file][accept^="audio"]')
    .setInputFiles({ name: "tone.wav", mimeType: "audio/wav", buffer: tone() });
  await page.getByRole("button", { name: "Save to button" }).click();
  await page.getByRole("button", { name: "Duplicate" }).click();
  await page
    .locator('input[type=file][accept^="audio"]')
    .setInputFiles({
      name: "second-tone.wav",
      mimeType: "audio/wav",
      buffer: tone(880),
    });
  await page.getByRole("button", { name: "Save to button" }).click();
  await page
    .getByRole("button", { name: "Record performance", exact: false })
    .click();
  await expect(
    page.getByRole("button", { name: "Stop recording performance" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "✎ Edit", exact: true }),
  ).toBeDisabled();
  await page.waitForTimeout(300);
  await page
    .locator(".pad")
    .first()
    .click({ position: { x: 15, y: 15 } });
  await page.waitForTimeout(300);
  await page
    .locator(".pad")
    .first()
    .click({ position: { x: 15, y: 15 } });
  await page.locator(".pad").nth(1).click();
  await page.waitForTimeout(600);
  await page.getByRole("button", { name: "Stop all sounds" }).click();
  await page.waitForTimeout(300);
  await page
    .getByRole("button", { name: "Stop recording performance" })
    .click();
  await expect(
    page.getByText("Performance saved on this device", { exact: false }),
  ).toBeVisible();
  const stats = await page.evaluate(async () => {
    const d = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open("soundspace");
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    const t = await new Promise<{ blob: Blob; duration: number }>(
      (resolve, reject) => {
        const r = d.transaction("data").objectStore("data").get("performance");
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      },
    );
    d.close();
    const c = new AudioContext();
    const decoded = await c.decodeAudioData(await t.blob.arrayBuffer());
    const a = decoded.getChannelData(0);
    const rms = (start: number, end: number) => {
      const s = a.slice(
        Math.floor(start * decoded.sampleRate),
        Math.floor(end * decoded.sampleRate),
      );
      return Math.sqrt(s.reduce((n, v) => n + v * v, 0) / s.length);
    };
    const result = {
      duration: decoded.duration,
      reported: t.duration,
      signal: rms(0.6, 1),
      start: rms(0, 0.1),
      end: rms(decoded.duration - 0.1, decoded.duration),
    };
    await c.close();
    return result;
  });
  expect(stats.duration).toBeGreaterThan(1);
  expect(stats.signal).toBeGreaterThan(0.03);
  expect(stats.start).toBeLessThan(0.005);
  expect(stats.end).toBeLessThan(0.005);
  for (const speed of ["0.5", "1", "1.5", "2", "4"]) {
    await page.getByLabel("Performance speed").selectOption(speed);
    await page
      .getByRole("button", { name: /Play performance|Restart performance/ })
      .click();
    expect(
      await page
        .locator(".performancebar audio")
        .evaluate((a) => (a as HTMLAudioElement).playbackRate),
    ).toBe(+speed);
    await page.getByRole("button", { name: "Stop all sounds" }).click();
    await expect(page.locator(".performancebar audio")).toHaveJSProperty(
      "paused",
      true,
    );
  }
  await expect(
    page.getByText("Performance saved on this device", { exact: false }),
  ).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download performance" }).click();
  expect((await download).suggestedFilename()).toMatch(/\.(webm|m4a|ogg)$/);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Play performance" }),
  ).toBeEnabled();
  await expect(page.getByLabel("Performance speed")).toHaveValue("4");
  await expect(page.locator(".pad")).toHaveCount(2);
  await page.getByLabel("Performance speed").selectOption("0.5");
  await page.getByRole("button", { name: "Play performance" }).click();
  await expect(page.locator(".performancebar audio")).toHaveJSProperty(
    "paused",
    false,
  );
  page.once("dialog", (d) => d.dismiss());
  await page
    .getByRole("button", { name: "Record performance", exact: false })
    .click();
  await expect(
    page.getByRole("button", { name: "Stop recording performance" }),
  ).toHaveCount(0);
});
