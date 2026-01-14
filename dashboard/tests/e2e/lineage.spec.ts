import { test, expect } from '@playwright/test';

test.describe('Lineage Visualization', () => {
  test('should display lineage graph with nodes', async ({ page }) => {
    await page.goto('/');
    await page.waitForResponse(resp => resp.url().includes('/api/dirs'));
    
    // Find a table (preferably a view which will have lineage)
    const viewItem = page.locator('[title*="View:"]').first();
    const tableItem = page.locator('[title*="Table:"]').first();
    
    const targetItem = await viewItem.count() > 0 ? viewItem : tableItem;
    
    if (await targetItem.count() > 0) {
      await targetItem.click();
      await page.waitForResponse(resp => resp.url().includes('/api/tables/'));
      
      // Switch to Lineage view
      await page.getByRole('button', { name: 'Lineage' }).click();
      
      // Wait for lineage data
      await page.waitForResponse(resp => resp.url().includes('/lineage'));
      
      // Should display SVG canvas
      const svg = page.locator('svg').last();
      await expect(svg).toBeVisible();
      
      // Should display legend
      await expect(page.getByText('Legend')).toBeVisible();
      await expect(page.getByText('Computed column')).toBeVisible();
      await expect(page.getByText('Stored column')).toBeVisible();
    }
  });

  test('should have zoom controls', async ({ page }) => {
    await page.goto('/');
    await page.waitForResponse(resp => resp.url().includes('/api/dirs'));
    
    const tableItem = page.locator('[title*="Table:"]').first();
    
    if (await tableItem.count() > 0) {
      await tableItem.click();
      await page.getByRole('button', { name: 'Lineage' }).click();
      
      // Zoom controls should be visible
      await expect(page.getByRole('button', { name: 'Zoom in' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Zoom out' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Reset' })).toBeVisible();
    }
  });
});
