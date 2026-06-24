// Selenium UI test for the SecureBank login page.
//
// It only exercises the static, client-rendered login page, so it does NOT
// need the backend API or MySQL — that keeps the CI workflow self-contained.
//
// Environment variables (set by the GitHub Actions workflow):
//   TEST_BASE_URL       URL where the built frontend is served (default local preview)
//   SELENIUM_REMOTE_URL Selenium WebDriver hub (omit to use a local chromedriver)
//
// Run locally:
//   npm run build && npx serve -s dist -l 4173 &
//   node e2e/login.e2e.mjs
import { Builder, By, until } from 'selenium-webdriver';
import assert from 'node:assert';

const baseUrl = process.env.TEST_BASE_URL || 'http://localhost:4173';
const seleniumUrl = process.env.SELENIUM_REMOTE_URL || '';

console.log(`[e2e] base URL : ${baseUrl}`);
console.log(`[e2e] selenium : ${seleniumUrl || '(local chromedriver)'}`);

async function buildDriver() {
  const builder = new Builder().forBrowser('chrome');
  if (seleniumUrl) builder.usingServer(seleniumUrl);
  return builder.build();
}

// Dump what the browser actually sees — invaluable when the page isn't what we expect.
async function dumpPage(driver, label) {
  try {
    const url = await driver.getCurrentUrl();
    const title = await driver.getTitle();
    const html = await driver.getPageSource();
    console.error(`[e2e] --- ${label} ---`);
    console.error(`[e2e] current URL: ${url}`);
    console.error(`[e2e] title      : ${title}`);
    console.error(`[e2e] page source (first 800 chars):\n${html.slice(0, 800)}`);
  } catch (e) {
    console.error(`[e2e] could not capture page state: ${e}`);
  }
}

(async function run() {
  const driver = await buildDriver();
  try {
    // "/" redirects to "/login" via React Router.
    await driver.get(baseUrl);

    // The username field is the most stable anchor on the login form.
    const username = await driver.wait(
      until.elementLocated(By.css('input[autocomplete="username"]')),
      15000,
    );
    assert.ok(username, 'username field should render');

    const password = await driver.findElement(By.css('input[autocomplete="current-password"]'));
    assert.ok(password, 'password field should render');

    const body = await driver.findElement(By.css('body')).getText();
    assert.ok(/SecureBank/i.test(body), 'page should show the SecureBank brand');
    assert.ok(/Sign In/i.test(body), 'page should show the Sign In heading');

    // Smoke-check that the field accepts input (no actual login is attempted).
    await username.sendKeys('john.doe');
    assert.strictEqual(await username.getAttribute('value'), 'john.doe');

    console.log('[e2e] PASS — login page renders and accepts input');
  } catch (err) {
    console.error('[e2e] FAIL —', err);
    await dumpPage(driver, 'page state at failure');
    process.exitCode = 1;
  } finally {
    await driver.quit();
  }
})();
