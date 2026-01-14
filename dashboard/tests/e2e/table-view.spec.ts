import { test, expect } from '@playwright/test';

test.describe('Table Schema View', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for the directory tree to load
    await page.waitForResponse(resp => resp.url().includes('/api/dirs'));
  });

  test('should display schema view with columns when table selected', async ({ page }) => {
    // Click on a table in the sidebar
    const tableItem = page.locator('[title*="Table:"]').first();
    
    if (await tableItem.count() > 0) {
      await tableItem.click();
      
      // Wait for schema data to load
      await page.waitForResponse(resp => resp.url().includes('/api/tables/'));
      
      // Schema tab should be active (has primary color)
      const schemaTab = page.getByRole('button', { name: 'Schema' });
      await expect(schemaTab).toBeVisible();
      
      // Should display columns table
      await expect(page.getByText('Columns')).toBeVisible();
    }
  });

  test('should switch between Schema, Data, and Lineage tabs', async ({ page }) => {
    const tableItem = page.locator('[title*="Table:"]').first();
    
    if (await tableItem.count() > 0) {
      await tableItem.click();
      await page.waitForResponse(resp => resp.url().includes('/api/tables/'));
      
      // Click Data tab
      const dataTab = page.getByRole('button', { name: 'Data' });
      await dataTab.click();
      
      // Should show pagination info
      await expect(page.getByText(/Showing.*of.*rows/)).toBeVisible();
      
      // Click Lineage tab
      const lineageTab = page.getByRole('button', { name: 'Lineage' });
      await lineageTab.click();
      
      // Should show lineage legend
      await expect(page.getByText('Legend')).toBeVisible();
    }
  });
});

test.describe('Data Preview', () => {
  test('should display paginated data grid', async ({ page }) => {
    await page.goto('/');
    await page.waitForResponse(resp => resp.url().includes('/api/dirs'));
    
    const tableItem = page.locator('[title*="Table:"]').first();
    
    if (await tableItem.count() > 0) {
      await tableItem.click();
      await page.waitForResponse(resp => resp.url().includes('/api/tables/'));
      
      // Switch to Data view
      await page.getByRole('button', { name: 'Data' }).click();
      
      // Wait for data to load
      await page.waitForResponse(resp => resp.url().includes('/data'));
      
      // Should show pagination controls
      await expect(page.getByText(/Page \d+ of \d+/)).toBeVisible();
    }
  });

  test('should navigate between pages', async ({ page }) => {
    await page.goto('/');
    await page.waitForResponse(resp => resp.url().includes('/api/dirs'));
    
    const tableItem = page.locator('[title*="Table:"]').first();
    
    if (await tableItem.count() > 0) {
      await tableItem.click();
      await page.getByRole('button', { name: 'Data' }).click();
      await page.waitForResponse(resp => resp.url().includes('/data'));
      
      // Get total pages text
      const paginationText = page.getByText(/Page \d+ of \d+/);
      const text = await paginationText.textContent();
      
      // If there are multiple pages, test navigation
      if (text && !text.includes('of 1')) {
        // Click next page button
        const nextButton = page.locator('button').filter({ has: page.locator('svg') }).last();
        await nextButton.click();
        
        // Page number should change
        await expect(page.getByText(/Page 2 of/)).toBeVisible();
      }
    }
  });
});
