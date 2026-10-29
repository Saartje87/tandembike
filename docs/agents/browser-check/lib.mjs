// Helpers for a browser check (docs/agents/browser-checks.md). Copy this file
// into the driver folder next to `playwright-core`; it is not run from here.
import { chromium } from 'playwright-core';

export const base = 'http://localhost:3100';

export const launch = () =>
  chromium.launch({
    executablePath:
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
  });

let rpcId = 0;

/**
 * Calls an MCP tool on the throwaway server and returns its parsed reply.
 * Throws on a refused call. Read each tool's input shape from its
 * `registerTool` call in `src/mcp/mcp-server.ts`.
 */
export async function call(name, args) {
  const res = await fetch(`${base}/api/mcp`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: ++rpcId,
      method: 'tools/call',
      params: { name, arguments: args },
    }),
  });
  const text = await res.text();
  const data = text.split('\n').find((line) => line.startsWith('data:'));
  const { result, error } = JSON.parse(data ? data.slice(5) : text);
  const body = result?.content?.[0]?.text ?? error?.message;
  if (error || result?.isError) throw new Error(`${name}: ${body}`);
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}

/** A fresh Project, so each run starts from the same state. */
export const freshProject = () =>
  call('create_project', { name: `Check ${Date.now()}` });

/** The open Ticket drawer for T`number`, apart from any Board behind it. */
export const drawerOf = (page, number) =>
  page.getByRole('dialog').filter({
    has: page.getByRole('button', { name: `Copy Ticket number T${number}` }),
  });

/** Opens T`number`'s drawer over its Project's Board and lets it settle. */
export async function openDrawer(page, projectId, number) {
  await page.goto(`${base}/project/${projectId}?ticket=${number}`);
  await drawerOf(page, number).waitFor();
  await page.waitForTimeout(1200);
}

/** The accessible names of the buttons inside `locator`, to find what to drive. */
export const buttonNames = (locator) =>
  locator
    .getByRole('button')
    .evaluateAll((buttons) =>
      buttons.map((b) => b.getAttribute('aria-label') || b.textContent.trim()),
    );

/**
 * Activates `locator` by `mode`: 'mouse' clicks it; 'Enter' or 'Space'
 * focuses it and presses the key, a keyboard click (`event.detail === 0`).
 * Run a check once per mode when a change touches click handling.
 */
export async function press(page, locator, mode) {
  if (mode === 'mouse') return locator.click();
  await locator.focus();
  await page.keyboard.press(mode);
}
