import { test, expect } from '@playwright/test';

test.describe('Chat demo smoke tests', () => {
  test('renders the chat layout and welcome content', async ({ page }) => {
    await page.route('**/chat/history?**', async (route) => {
      const url = new URL(route.request().url());
      const payload = { session_id: url.searchParams.get('session_id'), messages: [] };
      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    });

    await page.goto('/chat');

    await expect(page.getByRole('heading', { level: 1, name: 'Hello Chat' })).toBeVisible();
    await expect(
      page.getByText('Welcome to Horizon Labs Chat. Ask a question to begin.'),
    ).toBeVisible();
    const input = page.getByPlaceholder('Type your message…');
    await expect(input).toBeVisible();
    await input.fill('Smoke test typing');
    await expect(input).toHaveValue('Smoke test typing');
    await expect(page.getByRole('button', { name: 'Send' })).toBeEnabled();
    await expect(
      page.getByText('Instructor Mode Banner (feature flag controlled)'),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'New Chat' })).toBeVisible();
    await expect(page.getByTestId('session-select').first()).toBeVisible();
  });

  test('streams assistant tokens when the backend responds', async ({ page }) => {
    let historyCallCount = 0;
    await page.route('**/chat/history?**', async (route) => {
      historyCallCount += 1;
      const url = new URL(route.request().url());
      const sessionId = url.searchParams.get('session_id');
      const payload =
        historyCallCount === 1
          ? { session_id: sessionId, messages: [] }
          : {
              session_id: sessionId,
              messages: [
                {
                  role: 'user',
                  content: 'What is recursion?',
                  created_at: new Date().toISOString(),
                },
                {
                  role: 'assistant',
                  content: 'Hello learner! Keep exploring recursion.',
                  created_at: new Date().toISOString(),
                },
              ],
            };
      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    });

    await page.route('**/chat/stream', async (route) => {
      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
        body: [
          'data: {"type":"token","data":"Hello learner!"}\n\n',
          'data: {"type":"token","data":" Keep exploring recursion."}\n\n',
          'event: end\ndata: {}\n\n',
        ].join(''),
      });
    });

    await page.goto('/chat');

    const input = page.getByPlaceholder('Type your message…');
    await input.fill('What is recursion?');
    await page.getByRole('button', { name: 'Send' }).click();

    const streamingIndicator = page.getByText('streaming…');
    await expect(streamingIndicator).toBeVisible();

    await expect(
      page.locator('div.whitespace-pre-wrap', { hasText: 'What is recursion?' }).first(),
    ).toBeVisible();
    await expect(
      page.locator('div.whitespace-pre-wrap', {
        hasText: 'Hello learner! Keep exploring recursion.',
      }),
    ).toBeVisible();

    await expect(streamingIndicator).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Send' })).toBeEnabled();
  });

  test('shows an inline error when the backend stream fails', async ({ page }) => {
    await page.route('**/chat/history?**', async (route) => {
      const url = new URL(route.request().url());
      const payload = { session_id: url.searchParams.get('session_id'), messages: [] };
      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    });

    await page.route('**/chat/stream', async (route) => {
      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
        body: [
          'event: error\ndata: {"type":"error","message":"Service offline"}\n\n',
          'event: end\ndata: {}\n\n',
        ].join(''),
      });
    });

    await page.goto('/chat');

    const input = page.getByPlaceholder('Type your message…');
    await input.fill('Please fail gracefully');
    await page.getByRole('button', { name: 'Send' }).click();

    await expect(
      page.locator('div.whitespace-pre-wrap', { hasText: '⚠️ Service offline' }),
    ).toBeVisible();
    await expect(page.getByText('streaming…')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Send' })).toBeEnabled();
  });
});
