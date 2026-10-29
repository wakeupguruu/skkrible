import { test, expect } from '@playwright/test';

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
  await page.getByRole('button', { name: 'Room settings', exact: true }).click();
  await page.locator('[name="rounds"]').selectOption('1');
  await page.getByRole('button', { name: 'Save room settings' }).click();
  await expect(page.locator('#settings-dialog')).toBeHidden();
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
    await page.getByRole('button', { name: 'Let’s get drawing!' }).click();
    const word = await choose(page);
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
    await page.getByRole('button', { name: 'Let’s get drawing!' }).click();
    const word = await choose(page);
    await page.locator('#preview-canvas').scrollIntoViewIfNeeded();
    const rect = await page.locator('#preview-canvas').boundingBox();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: rect.x + 40, y: rect.y + 50 }] });
    for (let i = 1; i <= 12; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: rect.x + 40 + i * 10, y: rect.y + 50 + i * 5 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(() => friend.locator('#drawing-canvas').evaluate(canvas => canvas.getContext('2d').getImageData(0, 0, 1000, 750).data.some((n, i) => i % 4 !== 3 && n < 200))).toBeTruthy();
    await expect(page.locator('#chat-input')).toHaveCSS('font-size', '18px');
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
  await expect(page.getByRole('heading', { name: 'Bad drawings. Great company.' })).toBeVisible();
  await page.screenshot({ path: '.tools/ui-home-desktop.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.getByLabel('YOUR NAME', { exact: true }).fill('Lost friend');
  await page.getByLabel('Room code', { exact: true }).fill('AAAAAAAA');
  await page.getByRole('button', { name: 'Join room' }).click();
  await expect(page.locator('#home-error')).toContainText('missing or expired');
  await expect(page.locator('#home')).toBeVisible();
});
