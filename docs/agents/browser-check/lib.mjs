// Helpers for a browser check (docs/agents/browser-checks.md). Copy this file
// into the driver folder next to `playwright-core`; it is not run from here.
import { chromium } from 'playwright-core';

/** The throwaway server's port: `BROWSER_CHECK_PORT`, else 3100. */
export const port = Number(process.env.BROWSER_CHECK_PORT || 3100);

export const base = `http://localhost:${port}`;

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
 * `registerTool` call in `src/mcp/*-tools.ts`.
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

/**
 * A fresh Project, so each run starts from the same state. Creating a Project
 * is the User's, so MCP has no tool for it: this fills the New Project form on
 * /projects, as the User does, and returns { id, name }.
 */
export async function freshProject(page) {
  const name = `Check ${Date.now()}`;
  await page.goto(`${base}/projects`);
  const field = page.getByLabel('Project name');
  if (!(await field.isVisible())) {
    await page.getByRole('button', { name: /new project/i }).click();
  }
  await field.fill(name);
  await page.getByRole('button', { name: 'Create Project' }).click();
  await page.waitForURL(/\/project\/\d+/);
  return { id: Number(new URL(page.url()).pathname.split('/')[2]), name };
}

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

/** The Conversation dialog, which the app labels "Conversations". */
export const conversationDialog = (page) =>
  page.getByRole('dialog', { name: 'Conversations' });

/**
 * Opens the Conversation dialog on T`number`: opens its drawer, presses Ask
 * and returns the dialog's locator once it shows. Ask only opens a draft tab
 * ("Draft · Ask T`number`") and starts no run, unlike Start, Triage and Spec,
 * which do; nothing starts until the draft's Question is sent.
 */
export async function openConversationDialog(page, projectId, number) {
  await openDrawer(page, projectId, number);
  await drawerOf(page, number)
    .getByRole('button', { name: 'Ask', exact: true })
    .click();
  const dialog = conversationDialog(page);
  await dialog.waitFor();
  return dialog;
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

/**
 * Whether Playwright's `request` is the Save of Project `projectId`'s Agent
 * settings with `path` as its repository path. Settings also polls other
 * Server Actions on the same URL (T1384), so the save is the POST whose body
 * carries the path, not the first POST to the page (T1394). It reads the body
 * as the JSON text a Server Action sends for plain arguments; a multipart
 * body would never match, and the wait would time out.
 */
export function savesRepositoryPath(request, projectId, path) {
  return (
    request.method() === 'POST' &&
    new URL(request.url()).pathname === `/project/${projectId}/settings` &&
    (request.postData() ?? '').includes(JSON.stringify(path).slice(1, -1))
  );
}

/**
 * Sets Project `projectId`'s repository path to `path` through its settings
 * form, as the User does. Throws at once with the form's reason when the Save
 * is refused (such as a path another Project already uses), or when the path
 * did not stick, rather than letting a later step time out far from the cause.
 */
export async function setRepositoryPath(page, projectId, path) {
  await page.goto(`${base}/project/${projectId}/settings`);
  const form = page.getByRole('form', { name: 'Agent settings' });
  const field = form.getByLabel('Repository path', { exact: true });
  await field.fill(path);
  const saved = page.waitForResponse((response) =>
    savesRepositoryPath(response.request(), projectId, path),
  );
  await form.getByRole('button', { name: 'Save' }).click();
  await saved;
  // Save shows loading, so is disabled, until the form has handled the reply.
  await form.getByRole('button', { name: 'Save', disabled: false }).waitFor();
  // React's ids can hold characters a `#id` selector rejects.
  const reasonId = await field.getAttribute('aria-describedby');
  const refusal = [
    (await field.getAttribute('aria-invalid')) === 'true'
      ? await form.locator(`[id="${reasonId}"]`).textContent()
      : null,
    ...(await form.getByRole('alert').allTextContents()),
  ].filter(Boolean);
  if (refusal.length > 0) {
    throw new Error(
      `Settings refused repository path ${path} for Project ${projectId}: ${refusal.join(' ')}`,
    );
  }
  // A recompiling `next dev` can serve a reload before the save shows in it.
  const deadline = Date.now() + 10_000;
  let kept;
  for (;;) {
    kept = await page
      .reload()
      .then(() => field.inputValue())
      .catch((error) => `(reload failed: ${error.message.split('\n')[0]})`);
    if (kept === path || Date.now() > deadline) break;
    await page.waitForTimeout(500);
  }
  if (kept !== path) {
    throw new Error(
      `Repository path ${path} did not save for Project ${projectId}: Settings shows "${kept}".`,
    );
  }
}

/**
 * A new throwaway git repository: a fresh folder under /tmp with `git init`,
 * one commit and the branch `main`, so the app detects a default branch to
 * make run worktrees from. Returns its path.
 */
export async function throwawayRepository() {
  const { mkdtempSync, writeFileSync } = await import('node:fs');
  const { execFileSync } = await import('node:child_process');
  const folder = mkdtempSync('/tmp/check-repo-');
  const git = (...args) =>
    execFileSync('git', args, { cwd: folder, stdio: 'pipe' });
  git('init', '--quiet', '--initial-branch=main');
  writeFileSync(`${folder}/README.md`, '# Browser check repository\n');
  git('add', 'README.md');
  git(
    '-c',
    'user.name=Browser check',
    '-c',
    'user.email=browser-check@example.com',
    'commit',
    '--quiet',
    '--no-verify',
    '-m',
    'First commit',
  );
  return folder;
}

/**
 * A fresh Project with its own new throwaway repository (`throwawayRepository`)
 * as its repository path, for a check that starts an Agent run (a Start, a
 * Spar, a Triage). Every call makes a new folder, so runs against one server
 * never share a repository, which belongs to one Project. Throws at once if
 * Settings refuses the path. Returns { id, name, repository }.
 */
export async function freshProjectWithRepository(page) {
  const project = await freshProject(page);
  const repository = await throwawayRepository();
  await setRepositoryPath(page, project.id, repository);
  return { ...project, repository };
}

/**
 * Gives Project `projectId` a fresh empty folder as its repository path, for
 * a Start on a server with fake runs on (browser-checks.md, "Conversations in
 * a given state"), which runs nothing there. Throws if Settings refuses it.
 * A check that needs a git repository uses `freshProjectWithRepository`.
 */
export async function fakeRepository(page, projectId) {
  const { mkdtempSync } = await import('node:fs');
  await setRepositoryPath(page, projectId, mkdtempSync('/tmp/fake-repo-'));
}

/** Sends `text` as the User's reply in the open Conversation and lets it settle. */
export async function reply(page, text) {
  const box = page.getByRole('textbox', { name: 'Reply' });
  await box.fill(text);
  await box.press('Enter');
  await page.waitForTimeout(1500);
}
