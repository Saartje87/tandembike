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
  it('offers no Skill chips, even when the Project has Skills', async () => {
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
      await screen.findByRole('textbox', { name: 'Question' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Skills' })).toBeNull();
    expect(loadProjectSkills).not.toHaveBeenCalled();
  });
});
