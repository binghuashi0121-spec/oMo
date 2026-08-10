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
  await expect(page).toHaveURL(/\/map$/);
}

test('login, scenic switching, map filter and logout', async ({ page }, testInfo) => {
  await login(page, testInfo);
  await expect(page.getByRole('heading', { name: '车辆地图', exact: true })).toBeVisible();
  await expect(page.locator('.sidebar').getByRole('img', { name: 'oMo共享车' })).toBeVisible();
  await expect(page.getByText('地图安全降级模式')).toBeVisible();
  await expect(page.locator('.fallback-marker .app-icon').first()).toBeVisible();
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
  await page.getByRole('menuitem', { name: '订单管理' }).click();
  await expect(page).toHaveURL(/\/orders$/);
  await page.getByRole('button', { name: '详情' }).first().click();
  await expect(page.getByRole('heading', { name: /OM2026/ })).toBeVisible();
  await page.getByPlaceholder('追加一条内部备注，保存后不覆盖历史内容').fill('Playwright 追加备注验收');
  await page.getByRole('button', { name: '追加备注' }).click();
  await expect(page.getByText('Playwright 追加备注验收')).toBeVisible();
});

test('finance adjustment and reversal remain ledger based', async ({ page }) => {
  await login(page);
  await page.getByRole('menuitem', { name: '财务中心' }).click();
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
  await page.getByRole('menuitem', { name: '系统诊断' }).click();
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
