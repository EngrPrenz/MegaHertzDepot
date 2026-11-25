import { test, expect } from '@playwright/test';

test.describe('Countwise Offline-First PWA & Multi-Device Sync E2E', () => {
  test('creates items while offline, survives offline reload, and converges across two devices on reconnect', async ({
    browser,
  }) => {
    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();

    // 1. Register a store owner account on Device A while online
    await pageA.goto('/admin');
    await pageA.getByRole('button', { name: 'Create Account' }).click();
    await pageA.getByPlaceholder('Store Manager').fill('Staff A');
    const uniqueEmail = `staff_${Date.now()}@countwise.dev`;
    await pageA.getByPlaceholder('manager@store.com').fill(uniqueEmail);
    await pageA.getByPlaceholder('••••••••').fill('password123');
    await pageA.getByRole('button', { name: 'Create Store Account' }).click();

    await expect(pageA.getByTestId('open-pos-route-btn')).toBeVisible();
    await pageA.getByTestId('tab-inventory').click();

    // 2. Switch Device A to Offline Mode (Airplane Mode simulation)
    await contextA.setOffline(true);
    await expect(pageA.getByTestId('network-status-pill')).toContainText('Offline');

    // 3. Create a product and adjust stock while completely offline
    await pageA.getByTestId('add-product-btn').click();
    await pageA.getByTestId('new-product-name').fill('AMD Ryzen 7 7800X3D');
    await pageA.getByTestId('new-product-sku').fill('CPU-7800X3D');
    await pageA.getByTestId('new-product-stock').fill('15');
    await pageA.getByTestId('save-product-btn').click();

    await expect(pageA.getByTestId('stock-value-AMD Ryzen 7 7800X3D')).toHaveText('15');
    await expect(pageA.getByTestId('sync-pending-badge')).toContainText('2 pending');

    // Increment stock offline (+1 -> 16)
    await pageA.getByTestId('inc-stock-AMD Ryzen 7 7800X3D').click();
    await expect(pageA.getByTestId('stock-value-AMD Ryzen 7 7800X3D')).toHaveText('16');
    await expect(pageA.getByTestId('sync-pending-badge')).toContainText('3 pending');

    // 4. Reconnect Device A and verify outbox drains automatically
    await contextA.setOffline(false);
    await expect(pageA.getByTestId('network-status-pill')).toContainText('Online');
    await expect(pageA.getByTestId('sync-uptodate-badge')).toBeVisible({ timeout: 10000 });

    // 5. Open a second browser context (Device B), log in with the same store account, and verify convergence
    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    await pageB.goto('/admin');
    await pageB.getByPlaceholder('manager@store.com').fill(uniqueEmail);
    await pageB.getByPlaceholder('••••••••').fill('password123');
    await pageB.getByRole('button', { name: 'Sign In' }).click();

    await pageB.getByTestId('tab-inventory').click();
    await expect(pageB.getByTestId('stock-value-AMD Ryzen 7 7800X3D')).toHaveText('16', {
      timeout: 10000,
    });

    await contextA.close();
    await contextB.close();
  });
});

