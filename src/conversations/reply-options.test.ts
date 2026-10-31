import { describe, expect, it } from 'vitest';

import { replyQuestions } from './reply-options';

describe('replyQuestions', () => {
  it('finds a numbered list at the end as one question', () => {
    expect(replyQuestions('Which way?\n\n1. Left\n2. Right\n')).toEqual([
      {
        label: null,
        options: [
          { key: '1', text: 'Left' },
          { key: '2', text: 'Right' },
        ],
      },
    ]);
  });

  it('finds a lettered list', () => {
    expect(replyQuestions('Pick:\na) Red\nb) Blue')).toEqual([
      {
        label: null,
        options: [
          { key: 'a', text: 'Red' },
          { key: 'b', text: 'Blue' },
        ],
      },
    ]);
  });

  it('finds several questions with their own options', () => {
    const text =
      'Two questions.\n1. Which database?\n   a) SQLite\n   b) Postgres\n2. Which UI?\n   a) Web\n   b) CLI';
    expect(replyQuestions(text)).toEqual([
      {
        label: 'Q1',
        options: [
          { key: 'a', text: 'SQLite' },
          { key: 'b', text: 'Postgres' },
        ],
      },
      {
        label: 'Q2',
        options: [
          { key: 'a', text: 'Web' },
          { key: 'b', text: 'CLI' },
        ],
      },
    ]);
  });

  it('ignores a list that is followed by more text', () => {
    expect(replyQuestions('1. Left\n2. Right\n\nLet me know.')).toBeNull();
  });

  it('ignores a message without a list or with one item', () => {
    expect(replyQuestions('Hello there')).toBeNull();
    expect(replyQuestions('1. Only')).toBeNull();
  });
});
