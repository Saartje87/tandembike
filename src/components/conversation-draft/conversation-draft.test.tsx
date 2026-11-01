import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { loadProjectSkills } from '../../app/projects/actions';
import { renderWithTheme } from '../../test/render';
import { ConversationDraft } from './conversation-draft';

vi.mock('../../app/conversations/actions', () => ({
  startConversation: vi.fn(),
}));
vi.mock('../../app/projects/actions', () => ({
  loadProjectSkills: vi.fn(),
}));

describe('ConversationDraft', () => {
  it("offers the Skills of the asked-about Ticket's Project", async () => {
    vi.mocked(loadProjectSkills).mockResolvedValue({
      ok: true,
      skills: ['/mattpocock-skills:grilling'],
    });
    renderWithTheme(
      <ConversationDraft
        draft={{ key: 'a', intent: 'ask', ticketNumber: 42, text: '' }}
        onTextChange={vi.fn()}
        onStarted={vi.fn()}
      />,
    );

    expect(
      await screen.findByRole('button', {
        name: '/mattpocock-skills:grilling',
      }),
    ).toBeInTheDocument();
    expect(loadProjectSkills).toHaveBeenCalledWith({ ticketNumber: 42 });
  });

  it("offers the Skills of a new Ticket's Project", async () => {
    vi.mocked(loadProjectSkills).mockResolvedValue({ ok: true, skills: [] });
    renderWithTheme(
      <ConversationDraft
        draft={{ key: 'b', intent: 'new_ticket', projectId: 3, text: '' }}
        onTextChange={vi.fn()}
        onStarted={vi.fn()}
      />,
    );

    await vi.waitFor(() =>
      expect(loadProjectSkills).toHaveBeenCalledWith({ projectId: 3 }),
    );
  });
});
