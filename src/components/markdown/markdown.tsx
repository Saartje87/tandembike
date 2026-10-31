import { Box, Divider, Heading, Stack, Text } from '@blockle/blocks';
import { findAndReplace } from 'mdast-util-find-and-replace';
import type { FC } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';

import { modeColors } from '../../app/lib/mode-colors';
import { ticketByNumberPath } from '../../app/lib/paths';
import { AppLink } from '../app-link/app-link';
import * as styles from './markdown.css';

type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

export type MarkdownProps = {
  /** Markdown text, such as a Ticket's description. */
  children: string;
  /** The level a Markdown `#` heading gets; deeper ones follow from it. */
  headingLevel: HeadingLevel;
  /**
   * Break the line at every newline, as a chat message does, instead of
   * joining the lines of a paragraph.
   */
  breaks?: boolean;
};

const headingAt = (level: number) => Math.min(level, 6) as HeadingLevel;

/**
 * The components for each Markdown element, built from Blocks. The reset
 * strips browser styles, so lists, quotes, code blocks and tables get them
 * back here. Only `children` (and a link's `href`) are passed on, which
 * keeps react-markdown's `node` prop off the DOM.
 */
const componentsFor = (headingLevel: HeadingLevel): Components => ({
  h1: ({ children }) => <Heading level={headingLevel}>{children}</Heading>,
  h2: ({ children }) => (
    <Heading level={headingAt(headingLevel + 1)}>{children}</Heading>
  ),
  h3: ({ children }) => (
    <Heading level={headingAt(headingLevel + 2)}>{children}</Heading>
  ),
  h4: ({ children }) => (
    <Heading level={headingAt(headingLevel + 3)}>{children}</Heading>
  ),
  h5: ({ children }) => (
    <Heading level={headingAt(headingLevel + 4)}>{children}</Heading>
  ),
  h6: ({ children }) => (
    <Heading level={headingAt(headingLevel + 5)}>{children}</Heading>
  ),
  p: ({ children }) => <Text tag="p">{children}</Text>,
  strong: ({ children }) => (
    <Text tag="strong" fontWeight="bold">
      {children}
    </Text>
  ),
  em: ({ children }) => (
    <Text tag="em" fontStyle="italic">
      {children}
    </Text>
  ),
  del: ({ children }) => (
    <Text tag="del" textDecoration="line-through">
      {children}
    </Text>
  ),
  code: ({ children }) => (
    <Text tag="code" fontFamily="mono" fontSize="small">
      {children}
    </Text>
  ),
  pre: ({ children }) => (
    <Box
      asChild
      backgroundColor={modeColors.sunken}
      borderRadius={2}
      padding={3}
      overflow="auto"
    >
      <pre>{children}</pre>
    </Box>
  ),
  ul: ({ children }) => (
    <Box asChild paddingInlineStart={5}>
      <ul>{children}</ul>
    </Box>
  ),
  ol: ({ children }) => (
    <Box asChild paddingInlineStart={5}>
      <ol>{children}</ol>
    </Box>
  ),
  blockquote: ({ children }) => (
    <Box asChild paddingInlineStart={3} className={styles.blockquote}>
      <blockquote>{children}</blockquote>
    </Box>
  ),
  a: ({ href, children }) => (
    <AppLink href={href ?? ''} intent="primary" underline>
      {children}
    </AppLink>
  ),
  hr: () => <Divider />,
  table: ({ children }) => (
    <Box overflow="auto">
      <table className={styles.table}>{children}</table>
    </Box>
  ),
});

/**
 * A remark plugin that links each `T12` to that Ticket. Code is not text, so
 * it stays as written, and a Ticket named inside a link keeps that link.
 */
const remarkTicketLinks = () => (tree: Parameters<typeof findAndReplace>[0]) =>
  findAndReplace(
    tree,
    [
      /\bT([1-9]\d*)\b/g,
      (value: string, number: string) => ({
        type: 'link',
        url: ticketByNumberPath(Number(number)),
        children: [{ type: 'text', value }],
      }),
    ],
    { ignore: ['link', 'linkReference'] },
  );

const plugins = [remarkGfm, remarkTicketLinks];
const pluginsWithBreaks = [...plugins, remarkBreaks];

const componentsByLevel = new Map<HeadingLevel, Components>();

/**
 * The components for `headingLevel`, the same ones on every render: new ones
 * would be new component types to React, which would remount the whole text.
 */
const components = (headingLevel: HeadingLevel): Components => {
  let found = componentsByLevel.get(headingLevel);
  if (found === undefined) {
    found = componentsFor(headingLevel);
    componentsByLevel.set(headingLevel, found);
  }
  return found;
};

/**
 * Markdown, such as an Agent writes, rendered with Blocks. GitHub-flavoured
 * extras (tables, strikethrough, task lists) work, and each `T12` links to its
 * Ticket; raw HTML is not rendered.
 */
export const Markdown: FC<MarkdownProps> = ({
  children,
  headingLevel,
  breaks = false,
}) => (
  <Stack gap={3}>
    <ReactMarkdown
      remarkPlugins={breaks ? pluginsWithBreaks : plugins}
      components={components(headingLevel)}
    >
      {children}
    </ReactMarkdown>
  </Stack>
);
