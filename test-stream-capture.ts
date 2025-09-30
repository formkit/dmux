#!/usr/bin/env node
import { chromium } from 'playwright';
import { execSync } from 'child_process';
import { mkdirSync, existsSync, writeFileSync, appendFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Playwright automation to capture browser output of terminal streaming
 * Usage: npx tsx test-stream-capture.ts [pane-id]
 */

const OUTPUT_DIR = resolve('./test-output');
const SCREENSHOT_INTERVAL = 1000; // ms
const TEST_DURATION = 10000; // 10 seconds

async function main() {
  const paneId = process.argv[2];
  const portArg = process.argv[3];

  if (!paneId) {
    console.error('Usage: npx tsx test-stream-capture.ts <pane-id> [port]');
    console.error('Example: npx tsx test-stream-capture.ts streaming-test-pane 42000');
    process.exit(1);
  }

  // Create output directory
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  console.log(`[TEST] Starting browser automation for pane: ${paneId}`);
  console.log(`[TEST] Screenshots will be saved to: ${OUTPUT_DIR}`);

  // Get server port from argument or try to detect
  let serverPort = portArg ? parseInt(portArg) : 3000;
  if (!portArg) {
    try {
      const configPath = resolve('./.dmux/dmux.config.json');
      if (existsSync(configPath)) {
        const config = JSON.parse(require('fs').readFileSync(configPath, 'utf-8'));
        serverPort = config.serverPort || 3000;
      }
    } catch (error) {
      console.log('[TEST] Could not read config, using default port 3000');
    }
  }

  const dashboardUrl = `http://127.0.0.1:${serverPort}/`;
  console.log(`[TEST] Dashboard URL: ${dashboardUrl}`);

  // Launch browser
  const browser = await chromium.launch({
    headless: false, // Show browser for debugging
  });

  const context = await browser.newContext({
    viewport: { width: 1400, height: 1000 }
  });

  const page = await context.newPage();

  // Log console messages to file
  const consoleLogPath = resolve(OUTPUT_DIR, 'browser-console.log');
  writeFileSync(consoleLogPath, ''); // Clear file

  page.on('console', msg => {
    const type = msg.type();
    const text = msg.text();
    const logLine = `[BROWSER ${type.toUpperCase()}] ${text}\n`;

    // Log all console messages to see PATCH debug output
    console.log(logLine.trim());
    appendFileSync(consoleLogPath, logLine);
  });

  // Log page errors
  page.on('pageerror', error => {
    console.error('[BROWSER ERROR]', error.message);
  });

  // Navigate to dashboard first
  try {
    await page.goto(dashboardUrl, { waitUntil: 'networkidle', timeout: 10000 });
    console.log('[TEST] Dashboard loaded');
  } catch (error) {
    console.error('[TEST] Failed to load dashboard:', error);
    await browser.close();
    process.exit(1);
  }

  // Find and click the pane link
  try {
    console.log(`[TEST] Looking for pane: ${paneId}`);

    // Wait for pane cards to load
    await page.waitForSelector('.pane-card', { timeout: 5000 });

    // Find the pane card containing the slug and click it
    const paneCard = await page.locator(`.pane-card:has-text("${paneId}")`).first();
    await paneCard.click();

    console.log('[TEST] Clicked pane, waiting for terminal to load...');

    // Wait for terminal to appear
    await page.waitForSelector('.terminal-page', { timeout: 5000 });
    console.log('[TEST] Terminal page loaded');
  } catch (error) {
    console.error('[TEST] Failed to navigate to pane:', error);
    await browser.close();
    process.exit(1);
  }

  // Capture screenshots at intervals
  let screenshotCount = 0;
  const startTime = Date.now();

  console.log(`[TEST] Capturing screenshots for ${TEST_DURATION / 1000} seconds...`);

  const captureInterval = setInterval(async () => {
    const elapsed = Date.now() - startTime;

    if (elapsed >= TEST_DURATION) {
      clearInterval(captureInterval);
      console.log('[TEST] Test duration reached, finishing up...');

      // Take final screenshot
      await page.screenshot({
        path: resolve(OUTPUT_DIR, `final-${Date.now()}.png`),
        fullPage: true
      });

      console.log(`[TEST] Captured ${screenshotCount} screenshots`);
      console.log(`[TEST] Screenshots saved to: ${OUTPUT_DIR}`);

      await browser.close();
      process.exit(0);
    }

    try {
      const filename = `screenshot-${String(screenshotCount).padStart(4, '0')}.png`;
      await page.screenshot({
        path: resolve(OUTPUT_DIR, filename),
        fullPage: true
      });
      screenshotCount++;

      if (screenshotCount % 10 === 0) {
        console.log(`[TEST] Captured ${screenshotCount} screenshots (${Math.floor(elapsed / 1000)}s elapsed)`);
      }
    } catch (error) {
      console.error('[TEST] Screenshot failed:', error);
    }
  }, SCREENSHOT_INTERVAL);

  // Handle Ctrl+C
  process.on('SIGINT', async () => {
    console.log('\n[TEST] Interrupted by user');
    clearInterval(captureInterval);
    await browser.close();
    process.exit(0);
  });
}

main().catch(error => {
  console.error('[TEST] Fatal error:', error);
  process.exit(1);
});