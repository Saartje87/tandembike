import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  addReferenceTemplate,
  removeReferenceTemplate,
  updateReferenceTemplate,
} from '../../app/projects/actions';
import { renderWithTheme } from '../../test/render';
import type { ReferenceTemplate } from '../../tickets/reference-templates';
import { ReferenceTemplateEditor } from './reference-template-editor';

vi.mock('../../app/projects/actions', () => ({
  addReferenceTemplate: vi.fn(),
  removeReferenceTemplate: vi.fn(),
  updateReferenceTemplate: vi.fn(),
}));

const github: ReferenceTemplate = {
  id: 1,
  projectId: 3,
  prefix: '#',
  url: 'https://github.com/acme/web/issues/{n}',
};
const jira: ReferenceTemplate = {
  id: 2,
  projectId: 3,
  prefix: 'ABC-',
  url: 'https://acme.atlassian.net/browse/ABC-{n}',
};

const templateList = () =>
  screen.getByRole('list', { name: 'Reference templates' });

/** The add form at the bottom, which is not inside the list. */
const addForm = () =>
  screen.getByRole('form', { name: 'Add a Reference template' });

describe('ReferenceTemplateEditor', () => {
  beforeEach(() => {
    vi.mocked(addReferenceTemplate).mockReset();
    vi.mocked(removeReferenceTemplate).mockReset();
    vi.mocked(updateReferenceTemplate).mockReset();
  });

  it("lists the Project's templates in order, each with its prefix and URL", () => {
    renderWithTheme(
      <ReferenceTemplateEditor projectId={3} templates={[github, jira]} />,
    );

    expect(
      within(templateList())
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([
      expect.stringContaining('#https://github.com/acme/web/issues/{n}'),
      expect.stringContaining('ABC-https://acme.atlassian.net/browse/ABC-{n}'),
    ]);
  });

  it('says when there are none', () => {
    renderWithTheme(<ReferenceTemplateEditor projectId={3} templates={[]} />);

    expect(screen.queryByRole('list')).toBeNull();
    expect(screen.getByText(/No Reference templates yet/)).toBeInTheDocument();
  });

  it('adds a template and clears the form', async () => {
    vi.mocked(addReferenceTemplate).mockResolvedValue({ ok: true });
    renderWithTheme(<ReferenceTemplateEditor projectId={3} templates={[]} />);
    const form = within(addForm());

    await userEvent.type(form.getByLabelText('Prefix'), '#');
    await userEvent.type(
      form.getByLabelText('URL'),
      'https://github.com/acme/web/issues/{{n}',
    );
    await userEvent.click(form.getByRole('button', { name: 'Add' }));

    expect(addReferenceTemplate).toHaveBeenCalledWith({
      projectId: 3,
      prefix: '#',
      url: 'https://github.com/acme/web/issues/{n}',
    });
    await waitFor(() =>
      expect(within(addForm()).getByLabelText('Prefix')).toHaveValue(''),
    );
    expect(within(addForm()).getByLabelText('URL')).toHaveValue('');
  });

  it('shows a refusal under the field it names and keeps the draft', async () => {
    vi.mocked(addReferenceTemplate).mockResolvedValue({
      ok: false,
      error: 'Put {n} in the URL.',
      fieldErrors: { url: 'Put {n} in the URL.' },
    });
    renderWithTheme(<ReferenceTemplateEditor projectId={3} templates={[]} />);
    const form = within(addForm());

    await userEvent.type(form.getByLabelText('Prefix'), '#');
    await userEvent.type(form.getByLabelText('URL'), 'https://example.com');
    await userEvent.click(form.getByRole('button', { name: 'Add' }));

    const url = form.getByLabelText('URL');
    await waitFor(() => expect(url).toHaveAttribute('aria-invalid', 'true'));
    expect(url).toHaveAccessibleDescription('Put {n} in the URL.');
    expect(url).toHaveValue('https://example.com');
    expect(form.getByLabelText('Prefix')).not.toHaveAttribute('aria-invalid');
  });

  it('shows a refusal that names no field as an alert', async () => {
    vi.mocked(addReferenceTemplate).mockResolvedValue({
      ok: false,
      error: 'The Project "Website" is archived.',
    });
    renderWithTheme(<ReferenceTemplateEditor projectId={3} templates={[]} />);
    const form = within(addForm());

    await userEvent.type(form.getByLabelText('Prefix'), '#');
    await userEvent.type(form.getByLabelText('URL'), 'https://e.com/{{n}');
    await userEvent.click(form.getByRole('button', { name: 'Add' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The Project "Website" is archived.',
    );
  });

  it('edits a template in place', async () => {
    vi.mocked(updateReferenceTemplate).mockResolvedValue({ ok: true });
    renderWithTheme(
      <ReferenceTemplateEditor projectId={3} templates={[github, jira]} />,
    );

    await userEvent.click(
      screen.getByRole('button', { name: 'Edit Reference template #' }),
    );
    const form = within(
      screen.getByRole('form', { name: 'Edit Reference template #' }),
    );
    expect(form.getByLabelText('URL')).toHaveValue(github.url);
    await userEvent.clear(form.getByLabelText('Prefix'));
    await userEvent.type(form.getByLabelText('Prefix'), 'GH-');
    await userEvent.click(form.getByRole('button', { name: 'Save' }));

    expect(updateReferenceTemplate).toHaveBeenCalledWith({
      id: 1,
      prefix: 'GH-',
      url: github.url,
    });
    await waitFor(() =>
      expect(
        screen.queryByRole('form', { name: 'Edit Reference template #' }),
      ).toBeNull(),
    );
  });

  it('keeps an edit open with the reason when it is refused', async () => {
    vi.mocked(updateReferenceTemplate).mockResolvedValue({
      ok: false,
      error: 'This Project already has a Reference template for ABC-.',
      fieldErrors: {
        prefix: 'This Project already has a Reference template for ABC-.',
      },
    });
    renderWithTheme(
      <ReferenceTemplateEditor projectId={3} templates={[github, jira]} />,
    );

    await userEvent.click(
      screen.getByRole('button', { name: 'Edit Reference template #' }),
    );
    const form = within(
      screen.getByRole('form', { name: 'Edit Reference template #' }),
    );
    await userEvent.clear(form.getByLabelText('Prefix'));
    await userEvent.type(form.getByLabelText('Prefix'), 'ABC-');
    await userEvent.click(form.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(form.getByLabelText('Prefix')).toHaveAccessibleDescription(
        'This Project already has a Reference template for ABC-.',
      ),
    );
  });

  it('cancels an edit without saving', async () => {
    renderWithTheme(
      <ReferenceTemplateEditor projectId={3} templates={[github]} />,
    );

    await userEvent.click(
      screen.getByRole('button', { name: 'Edit Reference template #' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(
      screen.queryByRole('form', { name: 'Edit Reference template #' }),
    ).toBeNull();
    expect(updateReferenceTemplate).not.toHaveBeenCalled();
  });

  it('removes a template', async () => {
    vi.mocked(removeReferenceTemplate).mockResolvedValue({ ok: true });
    renderWithTheme(
      <ReferenceTemplateEditor projectId={3} templates={[github, jira]} />,
    );

    await userEvent.click(
      screen.getByRole('button', { name: 'Remove Reference template ABC-' }),
    );

    expect(removeReferenceTemplate).toHaveBeenCalledWith({ id: 2 });
  });

  it('shows why a removal was refused', async () => {
    vi.mocked(removeReferenceTemplate).mockResolvedValue({
      ok: false,
      error: 'There is no Reference template with id 2.',
    });
    renderWithTheme(
      <ReferenceTemplateEditor projectId={3} templates={[github, jira]} />,
    );

    await userEvent.click(
      screen.getByRole('button', { name: 'Remove Reference template ABC-' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'There is no Reference template with id 2.',
    );
  });
});
