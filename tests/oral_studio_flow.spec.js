const { test, expect } = require('@playwright/test');

test.describe('Oral Studio Medellín - E2E Suite', () => {
  test('Test 1: App Loads, 3D Tech Bento Renders & Hub Switcher Active', async ({ page }) => {
    await page.goto('http://localhost:3006');
    await expect(page).toHaveTitle(/Oral Studio Medellín/i);

    const brand = page.locator('.brand-logo');
    await expect(brand).toContainText('ORAL STUDIO');

    // Doctor and Location
    await expect(page.locator('.brand-sub')).toContainText('Dr. José Fernando Espitia');
    await expect(page.locator('.tech-card')).toContainText('Escaneo Intraoral 3D');
    await expect(page.locator('.tech-card')).toContainText('Laboratorio CAD/CAM Propio');

    // Hub Switcher
    const switchHub = page.locator('.btn-switch-hub');
    await expect(switchHub).toBeVisible();
    await expect(page.locator('.switcher-menu a[href="http://localhost:3005"]')).toBeAttached();
  });

  test('Test 2: Calculator Computes Porcelain Veneers Savings vs US Benchmark', async ({ page }) => {
    await page.goto('http://localhost:3006');
    await page.selectOption('#calc-treatment', 'emax_veneers');
    await page.fill('#calc-qty', '8');

    await expect(page.locator('#res-total-usd')).toContainText('$2,800 USD');
    await expect(page.locator('#res-us-cost')).toContainText('$16,000 USD');
    await expect(page.locator('#res-savings')).toContainText('Ahorras $13,200 USD (83%)');
  });

  test('Test 3: Triage Funnel with Carolina Registers Patient into SQLite CRM', async ({ page }) => {
    await page.goto('http://localhost:3006');

    // Step 1: Patient specifies treatment
    await page.fill('#user-input', 'Hello Carolina, I want 3D porcelain veneers');
    await page.click('#send-btn');

    const stream = page.locator('#chat-stream');
    await expect(stream).toContainText('Oral Studio');

    // Step 2: Patient answers travel city
    await page.fill('#user-input', 'I am traveling from Miami');
    await page.click('#send-btn');
    await expect(stream).toContainText('CAD/CAM robotics');

    // Step 3: Patient specifies travel dates
    await page.fill('#user-input', 'I will be in Medellin from Oct 10 to Oct 17');
    await page.click('#send-btn');
    await expect(stream).toContainText('full name');

    // Step 4: Patient submits contact details
    await page.fill('#user-input', 'Marcus Bradley, +1 305 892 1144');
    await page.click('#send-btn');
    await expect(stream).toContainText('has been registered');

    // Verify lead in Admin CRM modal
    await page.click('.btn-admin');
    const adminModal = page.locator('#admin-modal');
    await expect(adminModal).toBeVisible();
    await expect(page.locator('#leads-tbody')).toContainText('Marcus Bradley');
    await expect(page.locator('#leads-tbody')).toContainText('Diseño de Sonrisa en Porcelana E-Max');
  });
});

