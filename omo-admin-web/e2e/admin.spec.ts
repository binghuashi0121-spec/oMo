import { expect, test, type Page, type TestInfo } from '@playwright/test';

async function login(page: Page, testInfo?: TestInfo) {
  await page.goto('/login');
  await expect(page.getByRole('img', { name: 'oMo共享车' })).toBeVisible();
  await expect(page.locator('[data-icon="user"]')).toBeVisible();
  await expect(page.locator('[data-icon="lock"]')).toBeVisible();
  if (testInfo) await page.screenshot({ path: testInfo.outputPath('login.png'), fullPage: true });
  await page.getByPlaceholder('请输入管理员账号').fill('admin');
  await page.getByPlaceholder('请输入密码').fill('123456');
  await page.getByRole('button', { name: '安全登录' }).click();
  await expect(page).toHaveURL(/\/overview$/);
  await expect(page.getByRole('heading', { name: '全域运营态势' })).toBeVisible();
  await expect(page.locator('.command-metrics article').first().locator('strong')).toHaveText('4');
  await expect(page.getByText('OM202608100001', { exact: true })).toBeVisible();
  if (testInfo) await page.screenshot({ path: testInfo.outputPath('overview.png'), fullPage: true });
  await Promise.all([
    page.waitForURL(/\/map$/),
    page.getByRole('menuitem', { name: '车辆地图' }).click(),
  ]);
}

async function navigateByMenu(page: Page, name: string, path: RegExp) {
  await Promise.all([
    page.waitForURL(path),
    page.getByRole('menuitem', { name }).click(),
  ]);
}

test('login, scenic switching, map filter and logout', async ({ page }, testInfo) => {
  await login(page, testInfo);
  await expect(page.getByRole('heading', { name: '车辆地图', exact: true })).toBeVisible();
  await expect(page.locator('.sidebar').getByRole('img', { name: 'oMo共享车' })).toBeVisible();
  await expect(page.getByText('地图安全降级模式')).toBeVisible();
  await expect(page.getByLabel('车辆状态图例')).toContainText('可用');
  await expect(page.getByText(/每 15 秒自动刷新/)).toBeVisible();
  await expect(page.locator('.fallback-marker .vehicle-marker-image').first()).toBeVisible();
  await page.locator('.topbar .el-select').click();
  await page.getByRole('option', { name: /湖畔示范景区/ }).click();
  await expect(page.getByText(/GCJ-02 展示坐标 · 湖畔示范/)).toBeVisible();
  await page.getByPlaceholder('搜索车辆编号').fill('DEMO-01');
  await expect(page.getByText('DEMO-01', { exact: true }).first()).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('map.png'), fullPage: true });
  await page.locator('.user-button').click();
  await page.getByRole('button', { name: '退出', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test('order detail and append-only internal note', async ({ page }) => {
  await login(page);
  await navigateByMenu(page, '订单管理', /\/orders$/);
  await expect(page.getByText('当前页进行中', { exact: true })).toBeVisible();
  await expect(page.getByText('当前页已完成', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '详情' }).first().click();
  await expect(page.getByRole('heading', { name: /OM2026/ })).toBeVisible();
  await page.getByPlaceholder('追加一条内部备注，保存后不覆盖历史内容').fill('Playwright 追加备注验收');
  await page.getByRole('button', { name: '追加备注' }).click();
  await expect(page.getByText('Playwright 追加备注验收')).toBeVisible();
});

test('finance adjustment and reversal remain ledger based', async ({ page }) => {
  await login(page);
  await navigateByMenu(page, '财务中心', /\/finance$/);
  await expect(page.getByText('演示支付环境')).toBeVisible();
  await page.getByRole('button', { name: '详情' }).first().click();
  await page.getByRole('button', { name: '新增人工调账' }).click();
  await page.locator('.el-dialog .el-input-number input').fill('1.00');
  await page.locator('.el-dialog textarea').fill('Playwright 调账验收');
  await page.getByRole('button', { name: '下一步：二次确认' }).click();
  await page.getByRole('button', { name: '确认新增流水' }).click();
  await expect(page.getByText('Playwright 调账验收')).toBeVisible();
  await page.locator('.adjustment-item').filter({ hasText: 'Playwright 调账验收' }).getByRole('button', { name: '撤销' }).click();
  await page.locator('.el-message-box__input input').fill('Playwright 撤销流水验收');
  await page.getByRole('button', { name: '下一步' }).click();
  await page.getByRole('button', { name: '确认撤销' }).click();
  await expect(page.getByText('Playwright 撤销流水验收')).toBeVisible();
  await expect(page.getByText('已撤销').last()).toBeVisible();
});

test('system degraded and critical scenarios are explicit', async ({ page }) => {
  await login(page);
  await navigateByMenu(page, '系统诊断', /\/system$/);
  await page.getByRole('button', { name: '故障' }).click();
  await expect(page.getByText('核心服务故障，请立即处理').first()).toBeVisible();
  await expect(page.getByText('Broker 已断开', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '降级' }).click();
  await expect(page.getByText('系统可用，但存在需要关注的异常').first()).toBeVisible();
});

test('expired session returns to login with a clear notice', async ({ page }) => {
  await login(page);
  await page.evaluate(() => window.dispatchEvent(new Event('omo-admin-session-expired')));
  await expect(page).toHaveURL(/\/login\?.*expired=1/);
  await expect(page.getByText('会话已过期', { exact: true })).toBeVisible();
});

test('rapid scenic switching never restores an older scenic response', async ({ page }) => {
  await login(page);
  await expect(page.getByText('OMO-0008', { exact: true }).first()).toBeVisible();
  await page.evaluate(() => {
    sessionStorage.setItem('omo-admin-test-map-delay-lakeside-demo', '600');
    sessionStorage.setItem('omo-admin-test-map-delay-tianmashan', '40');
  });

  await page.locator('.topbar .el-select').click();
  await page.getByRole('option', { name: /湖畔示范景区/ }).click();
  await page.locator('.topbar .el-select').click();
  await page.getByRole('option', { name: '天马山景区', exact: true }).click();
  await expect(page.getByText(/GCJ-02 展示坐标 · 天马山/)).toBeVisible();
  await page.waitForTimeout(700);
  await expect(page.getByText('OMO-0008', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('DEMO-01', { exact: true })).toHaveCount(0);
});

test('refresh failure keeps cached map data and supports retry', async ({ page }) => {
  await login(page);
  await expect(page.locator('.vehicle-list-item')).toHaveCount(4);
  await page.evaluate(() => sessionStorage.setItem('omo-admin-test-fail-map-once', '1'));
  await page.getByRole('button', { name: '刷新', exact: true }).click();
  await expect(page.getByText(/当前展示上次成功数据/)).toBeVisible();
  await expect(page.locator('.vehicle-list-item')).toHaveCount(4);
  await page.getByRole('button', { name: '立即重试' }).click();
  await expect(page.locator('.stale-notice')).toHaveCount(0);
});

test('desktop layouts remain readable without overlapping table columns', async ({ page }, testInfo) => {
  await login(page);
  for (const route of ['orders', 'finance', 'system'] as const) {
    await page.goto(`/${route}`);
    await expect(page.locator('.page-data-state')).toBeVisible();
    await expect(page.locator('.topbar .el-select')).toContainText(/天马山景区|全部景区/);
    if (route === 'orders') await expect(page.locator('.order-table .el-table__row').first()).toBeVisible();
    if (route === 'finance') await expect(page.locator('.finance-chart canvas')).toBeVisible();
    if (route === 'system') await expect(page.locator('.health-card').first()).toBeVisible();
    await page.waitForTimeout(350);
    await page.screenshot({ path: testInfo.outputPath(`${route}.png`), fullPage: true });
  }

  await page.goto('/orders');
  const headers = await page.locator('.order-table th:visible').evaluateAll((elements) => elements.map((element) => {
    const rect = element.getBoundingClientRect();
    return { left: rect.left, right: rect.right, text: element.textContent?.trim() || '' };
  }));
  for (let index = 1; index < headers.length; index += 1) {
    expect(headers[index - 1].right, `${headers[index - 1].text} overlaps ${headers[index].text}`).toBeLessThanOrEqual(headers[index].left + 1);
  }
  await page.locator('.user-button').focus();
  const focusStyle = await page.locator('.user-button').evaluate((element) => getComputedStyle(element).outlineStyle);
  expect(focusStyle).not.toBe('none');
});
