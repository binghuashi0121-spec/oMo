import { expect, test } from '@playwright/test';

test('real API login, first password change, core pages and logout', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByText('当前为 Mock 交互原型')).toHaveCount(0);

  await page.getByPlaceholder('请输入管理员账号').fill('localadmin');
  await page.getByPlaceholder('请输入密码').fill('Local-Integration-A1');
  await page.getByRole('button', { name: '安全登录' }).click();

  const passwordDialog = page.getByRole('dialog', { name: '首次登录必须修改密码' });
  await expect(passwordDialog).toBeVisible();
  await passwordDialog.getByLabel('新密码', { exact: true }).fill('Local-Integration-B2');
  await passwordDialog.getByLabel('再次输入新密码', { exact: true }).fill('Local-Integration-B2');
  await passwordDialog.getByRole('button', { name: '修改密码并进入系统' }).click();

  await expect(page).toHaveURL(/\/overview$/);
  await expect(page.getByRole('heading', { name: '运营总览' })).toBeVisible();
  await expect(page.getByText('OM202608100001', { exact: true })).toBeVisible();

  for (const [menu, path, heading] of [
    ['车辆地图', '/map', '车辆地图'],
    ['订单管理', '/orders', '订单管理'],
    ['财务中心', '/finance', '财务中心'],
    ['系统诊断', '/system', '系统诊断'],
  ] as const) {
    await page.getByRole('menuitem', { name: menu }).click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
  }

  await page.locator('.user-button').click();
  await page.getByRole('button', { name: '退出', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
});
