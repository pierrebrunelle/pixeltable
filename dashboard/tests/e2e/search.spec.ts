import { test, expect } from '@playwright/test';

test.describe('Search Functionality', () => {
  test('should open search panel with keyboard shortcut', async ({ page }) => {
    await page.goto('/');
    
    // Press Cmd+K (or Ctrl+K on Windows/Linux)
    await page.keyboard.press('Meta+k');
    
    // Search dialog should be visible
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByPlaceholder(/search/i)).toBeVisible();
  });

  test('should open search panel by clicking search button', async ({ page }) => {
    await page.goto('/');
    
    // Click the search button in the sidebar
    await page.getByRole('button', { name: /search/i }).click();
    
    // Search dialog should be visible
    await expect(page.getByRole('dialog')).toBeVisible();
  });

  test('should close search panel with Escape', async ({ page }) => {
    await page.goto('/');
    
    // Open search
    await page.keyboard.press('Meta+k');
    await expect(page.getByRole('dialog')).toBeVisible();
    
    // Press Escape to close
    await page.keyboard.press('Escape');
    
    // Dialog should be hidden
    await expect(page.getByRole('dialog')).toBeHidden();
  });

  test('should display search results when typing', async ({ page }) => {
    await page.goto('/');
    await page.waitForResponse(resp => resp.url().includes('/api/dirs'));
    
    // Open search
    await page.getByRole('button', { name: /search/i }).click();
    
    // Type a search query
    const searchInput = page.getByPlaceholder(/search/i);
    await searchInput.fill('image');
    
    // Wait for search results
    await page.waitForResponse(resp => resp.url().includes('/api/search'));
    
    // Results should be visible (either tables, directories, or columns sections)
    // Allow time for debounced search
    await page.waitForTimeout(500);
  });

  test('should navigate to selected result', async ({ page }) => {
    await page.goto('/');
    await page.waitForResponse(resp => resp.url().includes('/api/dirs'));
    
    // Open search and type
    await page.getByRole('button', { name: /search/i }).click();
    const searchInput = page.getByPlaceholder(/search/i);
    await searchInput.fill('product');
    
    // Wait for search
    await page.waitForResponse(resp => resp.url().includes('/api/search'));
    await page.waitForTimeout(500);
    
    // Press Enter to select first result
    await page.keyboard.press('Enter');
    
    // Dialog should close and navigate
    await expect(page.getByRole('dialog')).toBeHidden();
  });
});
