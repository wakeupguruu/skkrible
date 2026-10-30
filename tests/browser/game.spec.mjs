import { test, expect } from '@playwright/test';

async function fitsScreen(page) {
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1 && document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
  for (const selector of ['#lobby-panel:not([hidden])', '#chat-form', '#board-wrap:not([hidden])']) {
    const element = page.locator(selector);
    if (!await element.count() || !await element.isVisible()) continue;
    const rect = await element.boundingBox();
    const size = page.viewportSize();
    expect(rect.y).toBeGreaterThanOrEqual(0); expect(rect.y + rect.height).toBeLessThanOrEqual(size.height + 1);
  }
}

async function create(page, name) {
  await page.goto('/');
  await page.getByLabel('YOUR NAME', { exact: true }).fill(name);
  await page.getByRole('button', { name: 'Create a private room' }).click();
  await expect(page.locator('#game')).toBeVisible();
  return new URL(page.url()).searchParams.get('room');
}
async function join(page, name, code) {
  await page.goto(`/?room=${code}`);
  await page.getByLabel('YOUR NAME', { exact: true }).fill(name);
  await page.getByRole('button', { name: 'Join room', exact: false }).click();
  await expect(page.locator('#game')).toBeVisible();
}
async function choose(page) {
  const button = page.locator('.word-choice').first();
  await expect(button).toBeVisible();
  const word = await button.textContent();
  await button.click();
  await expect(page.locator('#board-overlay')).toBeHidden();
  return word;
}

test('a private match restores a dropped seat, keeps draft text, and completes with scores', async ({ browser, page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const code = await create(page, 'Alice');
  await expect(page.locator('#lobby-panel')).toBeVisible();
  await page.locator('[name="rounds"]').selectOption('1');
  await page.locator('[name="wordCount"]').selectOption('5');
  await page.locator('[name="difficulty"]').selectOption('hard');
  await page.locator('[name="hints"]').selectOption('3');
  await page.locator('[name="drawTime"]').selectOption('30');
  await page.getByRole('button', { name: 'Save room settings' }).click();
  await expect(page.locator('#toast')).toHaveText('Room settings saved.');
  const otherContext = await browser.newContext();
  await otherContext.addInitScript(() => {
    const NativeSocket = window.WebSocket;
    window.testSockets = [];
    window.WebSocket = class extends NativeSocket {
      constructor(...args) { super(...args); window.testSockets.push(this); }
    };
  });
  const friend = await otherContext.newPage();
  friend.on('pageerror', error => errors.push(error.message));
  try {
    await join(friend, 'Bob', code);
    await expect(friend.locator('[name="difficulty"]')).toHaveValue('hard');
    await expect(friend.locator('[name="difficulty"]')).toBeDisabled();
    await page.screenshot({ path: '.tools/ui-lobby-desktop.png' });
    await fitsScreen(page);
    await page.getByRole('button', { name: 'Start game' }).click();
    await expect(page.locator('.word-choice')).toHaveCount(5);
    const word = await choose(page);
    await expect(page.locator('#timer-value')).toHaveText(/\d+/);
    await expect(friend.locator('#hint-status')).toContainText('next in');
    await fitsScreen(page);
    await page.setViewportSize({ width: 1366, height: 768 });
    await fitsScreen(page); await page.screenshot({ path: '.tools/ui-game-desktop.png' });
    await page.setViewportSize({ width: 320, height: 568 }); await fitsScreen(page);
    await page.setViewportSize({ width: 844, height: 390 }); await fitsScreen(page);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await expect(friend.locator('.word-choice')).toHaveCount(0);
    await expect(friend.locator('#word-display')).not.toHaveText(word);
    const rect = await page.locator('#preview-canvas').boundingBox();
    await page.mouse.move(rect.x + rect.width * .2, rect.y + rect.height * .3);
    await page.mouse.down();
    await page.mouse.move(rect.x + rect.width * .7, rect.y + rect.height * .6, { steps: 16 });
    await page.mouse.up();
    await expect.poll(() => friend.locator('#drawing-canvas').evaluate(canvas => canvas.getContext('2d').getImageData(0, 0, 1000, 750).data.some((n, i) => i % 4 !== 3 && n < 200))).toBeTruthy();
    await friend.locator('#chat-input').fill('this is my unfinished guess');
    await friend.evaluate(() => window.testSockets.at(-1).close(4000, 'Test connection loss'));
    await expect(friend.locator('#connection-status')).toContainText('Reconnecting');
    await otherContext.setOffline(true);
    await friend.waitForTimeout(800);
    await otherContext.setOffline(false);
    await expect(friend.locator('#connection-status')).toHaveText('Connected');
    await expect(friend.locator('#chat-input')).toHaveValue('this is my unfinished guess');
    await expect(friend.locator('#player-count')).toHaveText('2 / 12');
    await expect.poll(async () => {
      // GPU and software canvas readback can antialias edges differently after restoration.
      const signature = canvas => {
        const pixels = canvas.getContext('2d').getImageData(0, 0, 1000, 750).data;
        const ink = { count: 0, minX: 1000, minY: 750, maxX: 0, maxY: 0 };
        for (let i = 0; i < pixels.length; i += 4) if (pixels[i] < 200) {
          const x = i / 4 % 1000, y = Math.floor(i / 4 / 1000); ink.count++;
          ink.minX = Math.min(ink.minX, x); ink.minY = Math.min(ink.minY, y);
          ink.maxX = Math.max(ink.maxX, x); ink.maxY = Math.max(ink.maxY, y);
        }
        return ink;
      };
      const a = await page.locator('#drawing-canvas').evaluate(signature);
      const b = await friend.locator('#drawing-canvas').evaluate(signature);
      return a.count > 0 && Math.abs(a.count - b.count) / a.count < .025 && ['minX', 'minY', 'maxX', 'maxY'].every(key => Math.abs(a[key] - b[key]) <= 1);
    }).toBeTruthy();
    await friend.locator('#chat-input').fill('<img src=x onerror=alert(1)>');
    await friend.locator('#chat-input').press('Enter');
    await expect(page.locator('.chat-body').last()).toHaveText('<img src=x onerror=alert(1)>');
    await expect(page.locator('.chat-body img')).toHaveCount(0);
    await expect(page.locator('.chat-body').last()).toHaveCSS('font-size', '18px');
    await expect(friend.locator('#hint-status')).toContainText('Hint 1/', { timeout: 12_000 });
    await friend.locator('#chat-input').fill(word);
    await friend.locator('#chat-input').press('Enter');
    await expect(friend.locator('.chat-message.correct')).toContainText('Bob guessed it!');
    await friend.reload();
    await expect(friend.locator('#game')).toBeVisible();
    await expect(friend.locator('#player-count')).toHaveText('2 / 12');
    const second = await choose(friend);
    await page.locator('#chat-input').fill(second);
    await page.locator('#chat-input').press('Enter');
    await expect(page.getByRole('heading', { name: 'Nicely drawn, everyone.' })).toBeVisible();
    await expect(page.locator('.podium-person')).toHaveCount(2);
    await page.screenshot({ path: '.tools/ui-results-desktop.png', fullPage: true });
    await expect(page.getByRole('button', { name: 'One more round?' })).toBeEnabled();
    page.once('dialog', dialog => dialog.accept());
    await page.locator('#leave-room').click();
    await expect(page.locator('#home')).toBeVisible();
    await expect(friend.locator('#player-count')).toHaveText('1 / 12');
    expect(errors).toEqual([]);
  } finally { await otherContext.close(); }
});

test('mobile lobby and touch drawing fit the viewport and keep chat readable', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const friendContext = await browser.newContext(); const friend = await friendContext.newPage();
  try {
    await page.goto('/');
    await page.screenshot({ path: '.tools/ui-home-mobile.png', fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    const code = await create(page, 'Mobile artist');
    await join(friend, 'Desktop friend', code);
    await fitsScreen(page);
    await page.screenshot({ path: '.tools/ui-lobby-mobile.png' });
    await page.getByRole('button', { name: 'Start game' }).click();
    const word = await choose(page);
    await page.locator('#preview-canvas').scrollIntoViewIfNeeded();
    const rect = await page.locator('#preview-canvas').boundingBox();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: rect.x + 40, y: rect.y + 50 }] });
    for (let i = 1; i <= 12; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: rect.x + 40 + i * 10, y: rect.y + 50 + i * 5 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(() => friend.locator('#drawing-canvas').evaluate(canvas => canvas.getContext('2d').getImageData(0, 0, 1000, 750).data.some((n, i) => i % 4 !== 3 && n < 200))).toBeTruthy();
    await expect(page.locator('#chat-input')).toHaveCSS('font-size', '18px');
    await fitsScreen(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await page.screenshot({ path: '.tools/ui-room-mobile.png', fullPage: true });
    await friend.locator('#chat-input').fill(word);
    await friend.locator('#chat-input').press('Enter');
    await choose(friend);
    await page.locator('#chat-input').focus();
    await page.setViewportSize({ width: 390, height: 500 });
    await expect(page.locator('body')).toHaveClass(/typing/);
    await expect.poll(async () => {
      const board = await page.locator('#board-wrap').boundingBox();
      const form = await page.locator('#chat-form').boundingBox();
      return board.y >= 0 && board.y + board.height <= form.y && form.y + form.height <= 500;
    }).toBeTruthy();
    await page.screenshot({ path: '.tools/ui-guess-mobile-keyboard.png' });
    expect(errors).toEqual([]);
  } finally { await context.close(); await friendContext.close(); }
});

test('desktop welcome is responsive and an unknown invite gives a useful error', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Draw. Guess. Repeat.' })).toBeVisible();
  const before = await page.locator('#avatar-preview').innerHTML();
  await page.getByRole('button', { name: 'Next eyes' }).click();
  expect(await page.locator('#avatar-preview').innerHTML()).not.toEqual(before);
  await page.getByRole('button', { name: 'Avatar color 5', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Avatar color 5', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({ path: '.tools/ui-home-desktop.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.getByLabel('YOUR NAME', { exact: true }).fill('Lost friend');
  await page.getByLabel('Room code', { exact: true }).fill('AAAAAAAA');
  await page.getByRole('button', { name: 'Join room' }).click();
  await expect(page.locator('#home-error')).toContainText('missing or expired');
  await expect(page.locator('#home')).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('skkrible:profile')).avatar)).toBe(12);
  const customFace = await page.locator('#avatar-preview').innerHTML();
  await page.reload();
  expect(await page.locator('#avatar-preview').innerHTML()).toEqual(customFace);
});

test('home and lobby controls fit small phones, laptop, desktop, and landscape without page scrolling', async ({ page }) => {
  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 1366, height: 768 }, { width: 1920, height: 1080 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport); await page.goto('/');
    await fitsScreen(page);
    const homeCard = await page.locator('.join-card').boundingBox();
    expect(homeCard.x).toBeGreaterThanOrEqual(0); expect(homeCard.x + homeCard.width).toBeLessThanOrEqual(viewport.width);
    expect(homeCard.y).toBeGreaterThanOrEqual(0);
    expect(homeCard.y + homeCard.height).toBeLessThanOrEqual(viewport.height + 1);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await create(page, 'Layout check');
  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 1366, height: 768 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport); await fitsScreen(page);
    for (const selector of ['#settings-form select', '#custom-words', '#start-game']) {
      for (const control of await page.locator(selector).all()) {
        const rect = await control.boundingBox();
        const panel = await page.locator('#lobby-panel').boundingBox();
        expect(rect.y).toBeGreaterThanOrEqual(0); expect(rect.y + rect.height).toBeLessThan(viewport.height);
        expect(rect.y).toBeGreaterThanOrEqual(panel.y); expect(rect.y + rect.height).toBeLessThanOrEqual(panel.y + panel.height);
        expect(rect.x).toBeGreaterThanOrEqual(panel.x); expect(rect.x + rect.width).toBeLessThanOrEqual(panel.x + panel.width);
      }
    }
  }
});
