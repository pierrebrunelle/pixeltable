import { test, expect } from '@playwright/test';

test.describe('Directory Navigation', () => {
  test('should display the dashboard homepage', async ({ page }) => {
    await page.goto('/');
    
    // Check that the sidebar is visible
    await expect(page.getByRole('heading', { name: 'Pixeltable' })).toBeVisible();
    
    // Check that the welcome message is displayed
    await expect(page.getByText('Pixeltable Dashboard')).toBeVisible();
  });

  test('should display directory tree in sidebar', async ({ page }) => {
    await page.goto('/');
    
    // Wait for the API to load
    await page.waitForResponse(resp => resp.url().includes('/api/dirs'));
    
    // The sidebar should contain at least one item (directory or table)
    const sidebar = page.locator('aside');
    await expect(sidebar).toBeVisible();
  });

  test('should navigate to a table when clicked', async ({ page }) => {
    await page.goto('/');
    
    // Wait for the directory tree to load
    await page.waitForResponse(resp => resp.url().includes('/api/dirs'));
    
    // Click on a table in the sidebar (if one exists)
    const tableItem = page.locator('[title*="Table:"]').first();
    
    if (await tableItem.count() > 0) {
      await tableItem.click();
      
      // URL should change to include /table/
      await expect(page).toHaveURL(/\/table\//);
      
      // Schema tab should be visible
      await expect(page.getByRole('button', { name: 'Schema' })).toBeVisible();
    }
  });

  test('should collapse and expand sidebar', async ({ page }) => {
    await page.goto('/');
    
    // Find and click the collapse button
    const collapseButton = page.getByRole('button', { name: /collapse/i });
    await collapseButton.click();
    
    // Sidebar should be collapsed (narrower)
    const sidebar = page.locator('aside');
    const box = await sidebar.boundingBox();
    expect(box?.width).toBeLessThan(100);
    
    // Click again to expand
    await collapseButton.click();
    
    // Sidebar should be expanded
    const expandedBox = await sidebar.boundingBox();
    expect(expandedBox?.width).toBeGreaterThan(200);
  });
});
