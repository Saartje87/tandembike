import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderWithTheme } from '../../test/render';
import { Markdown } from './markdown';

describe('Markdown', () => {
  // A click on the text opens an edit, and a re-render between the press
  // and the release must not swap the clicked element for a new one.
  it('keeps its elements when it renders again', () => {
    const { rerender } = renderWithTheme(
      <Markdown headingLevel={3}>{'Fix **the** header.'}</Markdown>,
    );
    const before = screen.getByText('the');

    rerender(<Markdown headingLevel={3}>{'Fix **the** header.'}</Markdown>);

    expect(screen.getByText('the')).toBe(before);
  });

  it('renders headings below the heading level it is given', () => {
    renderWithTheme(
      <Markdown headingLevel={3}>{'# Plan\n\n## Steps'}</Markdown>,
    );

    expect(
      screen.getByRole('heading', { level: 3, name: 'Plan' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 4, name: 'Steps' }),
    ).toBeInTheDocument();
  });

  it('renders paragraphs, emphasis, lists and code', () => {
    renderWithTheme(
      <Markdown headingLevel={3}>
        {
          'Fix **the** header.\n\n- one\n- two\n\n1. first\n\nRun `npm test`.\n\n```\nnpm run check\n```'
        }
      </Markdown>,
    );

    expect(screen.getByText('the').tagName).toBe('STRONG');
    expect(
      screen.getAllByRole('listitem').map((item) => item.textContent),
    ).toEqual(['one', 'two', 'first']);
    expect(screen.getByText('npm test').tagName).toBe('CODE');
    expect(screen.getByText('npm run check').closest('pre')).not.toBeNull();
  });

  it('renders GitHub-flavoured strikethrough and tables', () => {
    renderWithTheme(
      <Markdown headingLevel={3}>
        {'~~old~~\n\n| Field | Value |\n| --- | --- |\n| Status | Done |'}
      </Markdown>,
    );

    expect(screen.getByText('old').tagName).toBe('DEL');
    expect(screen.getByRole('cell', { name: 'Done' })).toBeInTheDocument();
  });

  it('renders links', () => {
    renderWithTheme(
      <Markdown headingLevel={3}>
        {'See [the spec](https://example.com).'}
      </Markdown>,
    );

    expect(screen.getByRole('link', { name: 'the spec' })).toHaveAttribute(
      'href',
      'https://example.com',
    );
  });

  it('links the Tickets it names, outside code and other links', () => {
    renderWithTheme(
      <Markdown headingLevel={3}>
        {'Split into T41 and **T42**, not `T43` or [T44](https://example.com).'}
      </Markdown>,
    );

    expect(screen.getByRole('link', { name: 'T41' })).toHaveAttribute(
      'href',
      '/ticket/41',
    );
    expect(screen.getByRole('link', { name: 'T42' })).toHaveAttribute(
      'href',
      '/ticket/42',
    );
    expect(screen.getByText('T43').tagName).toBe('CODE');
    expect(screen.getByRole('link', { name: 'T44' })).toHaveAttribute(
      'href',
      'https://example.com',
    );
    expect(screen.getAllByRole('link')).toHaveLength(3);
  });

  it('joins lines of one paragraph by default', () => {
    const { container } = renderWithTheme(
      <Markdown headingLevel={3}>{'one\ntwo'}</Markdown>,
    );

    expect(container.querySelector('br')).toBeNull();
  });

  it('breaks the line at each newline with `breaks`', () => {
    const { container } = renderWithTheme(
      <Markdown headingLevel={3} breaks>
        {'one\ntwo'}
      </Markdown>,
    );

    expect(container.querySelectorAll('br')).toHaveLength(1);
  });

  it('leaves raw HTML unrendered', () => {
    const { container } = renderWithTheme(
      <Markdown headingLevel={3}>{'<script>alert(1)</script> hi'}</Markdown>,
    );

    expect(container.querySelector('script')).toBeNull();
  });
});
