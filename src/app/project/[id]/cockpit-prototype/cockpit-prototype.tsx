'use client';

// PROTOTYPE (T1103), throwaway: three layouts of the Cockpit over fixture
// data, switched with ?variant= and ?scenario= from a floating bar.
// Actions do nothing. Deleted by T1104; not production code, no tests.

import {
  Alert,
  Box,
  Button,
  Grid,
  GridItem,
  Heading,
  IconButton,
  Inline,
  Progress,
  Select,
  Stack,
  Tag,
  Text,
} from '@blockle/blocks';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { type FC, type ReactNode, useEffect } from 'react';

import { AppLink } from '../../../../components/app-link/app-link';
import { Icon, type IconName } from '../../../../components/icon/icon';
import {
  strongColor,
  tinted,
} from '../../../../components/palette/palette.css';
import type { PaletteColor } from '../../../../tickets/palette';
import { modeColors } from '../../../lib/mode-colors';
import { ticketByNumberPath } from '../../../lib/paths';
import * as styles from './cockpit-prototype.css';
import {
  type EpicRef,
  type FlightRow,
  type NeedItem,
  type NeedKind,
  type PlainTicket,
  type Scenario,
  type ScenarioKey,
  scenarioKeys,
  scenarios,
} from './fixtures';

const variants = {
  A: 'One column',
  B: 'Two panes',
  C: 'One queue',
} as const;

type VariantKey = keyof typeof variants;

const variantKeys = Object.keys(variants) as VariantKey[];

const noop = () => {};

const ago = (minutes: number) =>
  minutes < 60
    ? `${minutes}m`
    : minutes < 1440
      ? `${Math.round(minutes / 60)}h`
      : `${Math.round(minutes / 1440)}d`;

const usd = (amount: number) => `$${amount.toFixed(2)}`;

const needsYouCount = (s: Scenario) =>
  s.actionNeeded.length + s.review.length + s.intake.length;

const kindIcon: Record<NeedKind, IconName> = {
  permission: 'shield-exclamation',
  question: 'chat-bubble-left-ellipsis',
  failed: 'exclamation-circle',
  interrupted: 'pause-circle',
  idle: 'hand-raised',
  stalled: 'exclamation-triangle',
  review: 'check-circle',
  intake: 'inbox',
};

const kindLabel: Record<NeedKind, string> = {
  permission: 'Permission',
  question: 'Question',
  failed: 'Failed',
  interrupted: 'Interrupted',
  idle: 'Idle',
  stalled: 'Stalled',
  review: 'Review',
  intake: 'Intake',
};

// ── Shared small pieces ────────────────────────────────────────────────

const EpicTag: FC<{ item: { epic?: NeedItem['epic'] } }> = ({ item }) =>
  item.epic ? (
    <Tag className={tinted[item.epic.color]}>
      T{item.epic.number} {item.epic.title}
    </Tag>
  ) : null;

/**
 * What a Needs you row offers in the list: only Allow and Deny on a
 * permission. Everything else opens the Ticket (or its Conversation), where
 * the User sets its state; a row shows its PR or label as information.
 */
const NeedActions: FC<{ item: NeedItem }> = ({ item }) => {
  switch (item.kind) {
    case 'permission':
      return (
        <Inline gap={2} flexWrap="nowrap">
          <Button size="small" variant="solid" onClick={noop}>
            Allow
          </Button>
          <Button size="small" variant="outline" onClick={noop}>
            Deny
          </Button>
        </Inline>
      );
    case 'review':
      return <Text fontSize="small">PR {item.pr}</Text>;
    case 'intake':
      return <Tag>{item.label}</Tag>;
    default:
      return null;
  }
};

const Pips: FC<{ row: FlightRow }> = ({ row }) =>
  row.epic ? (
    <Inline gap={1} flexWrap="nowrap" aria-label="Children">
      {row.epic.children.map((child) => (
        <span
          key={child.number}
          title={`T${child.number} ${child.title}: ${child.state}`}
          className={`${styles.pip} ${styles.pipState[child.state]}`}
        />
      ))}
      <Text fontSize="xsmall" color="muted" paddingInlineStart={1}>
        {row.epic.children.filter((c) => c.state === 'done').length}/
        {row.epic.children.length}
      </Text>
    </Inline>
  ) : null;

const sectionIntent = {
  Running: 'primary',
  'Action needed': 'warning',
  Review: 'info',
} as const;

const Header: FC<{ s: Scenario }> = ({ s }) => (
  <Stack gap={2}>
    <Inline gap={3} alignY="center" alignX="between">
      <Inline gap={2} alignY="center">
        <Heading level={2}>Cockpit</Heading>
        {s.cycle && (
          <Text color="muted">
            Cycle “{s.cycle.title}” · {s.cycle.done}/{s.cycle.total} done
          </Text>
        )}
      </Inline>
      <Inline gap={3} alignY="center">
        <Tag intent="neutral" startSlot={<Icon name="cpu-chip" size="small" />}>
          Runs {s.runs.used}/{s.runs.cap}
        </Tag>
        <Tag
          intent={s.autopilot.paused ? 'warning' : 'success'}
          startSlot={<Icon name="bolt" size="small" />}
        >
          Autopilot {s.autopilot.paused ? 'paused' : 'on'} ·{' '}
          {usd(s.autopilot.spend)} / {usd(s.autopilot.ceiling)}
        </Tag>
      </Inline>
    </Inline>
    {s.cycle && (
      <Progress
        value={Math.round((s.cycle.done / s.cycle.total) * 100)}
        aria-label="Cycle progress"
      />
    )}
    {s.autopilot.paused && (
      <Alert intent="warning">
        Autopilot paused: over ceiling ({usd(s.autopilot.spend)} of{' '}
        {usd(s.autopilot.ceiling)}). Raise the ceiling or start the next Cycle.
        Running runs finish.
      </Alert>
    )}
    {s.cycle && s.cycle.done === s.cycle.total && (
      <Alert intent="success">
        Every Ticket in this Cycle is Done.{' '}
        <Button size="small" variant="outline" onClick={noop}>
          Archive the Cycle
        </Button>{' '}
        <Button size="small" variant="outline" onClick={noop}>
          Start a Retro
        </Button>
      </Alert>
    )}
  </Stack>
);

const NoCycle: FC = () => (
  <Box
    backgroundColor={modeColors.sunken}
    borderRadius={3}
    padding={6}
    textAlign="center"
  >
    <Stack gap={3} alignX="center">
      <Heading level={2}>No Active Cycle</Heading>
      <Text color="muted">
        The Cockpit shows the Active Cycle. Start a Cycle to see what needs you
        and how the work is going.
      </Text>
      <Button variant="solid" onClick={noop}>
        Start a Cycle
      </Button>
    </Stack>
  </Box>
);

type TicketRowProps = {
  icon: IconName;
  number: number;
  title: string;
  line: string;
  epic?: EpicRef;
  /** Greyed out, for work that does not need the User now. */
  muted?: boolean;
  end?: ReactNode;
};

/** One Ticket as a row: the same shape in every section of the Cockpit. */
const TicketRow: FC<TicketRowProps> = ({
  icon,
  number,
  title,
  line,
  epic,
  muted = false,
  end,
}) => (
  <Box
    asChild
    paddingBlock={2}
    paddingInline={3}
    borderRadius={2}
    backgroundColor={muted ? modeColors.sunken : modeColors.raised}
    boxShadow={muted ? undefined : 1}
    className={epic ? styles.epicEdge[epic.color] : styles.row}
  >
    <li>
      <Inline gap={3} alignY="center" alignX="between">
        <Inline gap={2} alignY="center" minInlineSize={0} flex={1}>
          <Icon
            name={icon}
            size="small"
            color={muted ? modeColors.textMuted : undefined}
          />
          <Text fontFamily="mono" fontSize="small" color="muted">
            T{number}
          </Text>
          <Stack gap={0} minInlineSize={0} flex={1}>
            <Inline gap={2} alignY="center">
              <Text
                truncate
                fontWeight={muted ? 'normal' : 'medium'}
                color={muted ? 'muted' : undefined}
              >
                <AppLink href={ticketByNumberPath(number)} intent="inherit">
                  {title}
                </AppLink>
              </Text>
              {epic && muted && <EpicTag item={{ epic }} />}
            </Inline>
            <Text truncate fontSize="small" color="muted">
              {line}
            </Text>
          </Stack>
        </Inline>
        {end}
      </Inline>
    </li>
  </Box>
);

/** A titled group of rows that opens and closes on its heading. */
const Disclosure: FC<{
  title: string;
  count: number;
  open?: boolean;
  children: ReactNode;
}> = ({ title, count, open = false, children }) => (
  <details open={open}>
    <Box asChild className={styles.summary} paddingBlockEnd={1}>
      <summary>
        <Inline gap={2} alignY="center">
          <span className={styles.chevron}>
            <Icon name="chevron-right" size="small" />
          </span>
          <Text fontSize="small" fontWeight="strong" color="muted">
            {title}
          </Text>
          <Tag>{count}</Tag>
        </Inline>
      </summary>
    </Box>
    <Stack gap={1} listStyle="none" role="list" asChild>
      <ul>{children}</ul>
    </Stack>
  </details>
);

type ListKind = 'your-work' | 'queued' | 'done';

const plainRow = (kind: ListKind, t: PlainTicket, index: number) => {
  switch (kind) {
    case 'your-work':
      return (
        <TicketRow
          key={t.number}
          muted
          icon="user"
          number={t.number}
          title={t.title}
          epic={t.epic}
          line={`ready-for-human · for ${ago(t.age ?? 0)}`}
          end={<Tag>For human</Tag>}
        />
      );
    case 'queued':
      return (
        <TicketRow
          key={t.number}
          muted
          icon="clock"
          number={t.number}
          title={t.title}
          epic={t.epic}
          line={`Queued #${index + 1} · ready-for-agent${t.blockedBy ? ` · blocked by T${t.blockedBy}` : ''}`}
          end={
            t.blockedBy ? (
              <Tag intent="warning">Blocked</Tag>
            ) : index === 0 ? (
              <Tag intent="primary">Next</Tag>
            ) : (
              <Tag>Queued</Tag>
            )
          }
        />
      );
    case 'done':
      return (
        <TicketRow
          key={t.number}
          muted
          icon="check-circle"
          number={t.number}
          title={t.title}
          epic={t.epic}
          line={`Done ${ago(t.age ?? 0)} ago · PR ${t.pr ?? '–'} · ${usd(t.cost ?? 0)}`}
          end={<Tag intent="success">Done</Tag>}
        />
      );
  }
};

/** A list of work that does not need the User now, closed by default. */
const Collapsed: FC<{
  title: string;
  kind: ListKind;
  tickets: PlainTicket[];
}> = ({ title, kind, tickets }) => (
  <Disclosure title={title} count={tickets.length}>
    {tickets.map((t, i) => plainRow(kind, t, i))}
  </Disclosure>
);

const Section: FC<{ title: string; count?: number; children: ReactNode }> = ({
  title,
  count,
  children,
}) => (
  <Stack gap={2} asChild>
    <section aria-label={title}>
      <Inline gap={2} alignY="center">
        <Heading level={3}>{title}</Heading>
        {count !== undefined && <Tag>{count}</Tag>}
      </Inline>
      {children}
    </section>
  </Stack>
);

// ── Variant A: one column, stacked by urgency ─────────────────────────

const NeedRowA: FC<{ item: NeedItem }> = ({ item }) => (
  <TicketRow
    icon={kindIcon[item.kind]}
    number={item.number}
    title={item.title}
    epic={item.epic}
    line={`${kindLabel[item.kind]} · ${item.line} · ${ago(item.waiting)}`}
    end={<NeedActions item={item} />}
  />
);

/** A Needs you group, open by default and closable on its heading. */
const NeedGroup: FC<{
  title: string;
  items: NeedItem[];
  Row: FC<{ item: NeedItem }>;
}> = ({ title, items, Row }) =>
  items.length === 0 ? null : (
    <Disclosure title={title} count={items.length} open>
      {items.map((item) => (
        <Row key={item.number} item={item} />
      ))}
    </Disclosure>
  );

const FlightRowView: FC<{ row: FlightRow; needsYouChild: boolean }> = ({
  row,
  needsYouChild,
}) => {
  const head = (
    <Inline gap={3} alignY="center" alignX="between">
      <Inline gap={2} alignY="center" minInlineSize={0} flex={1}>
        {row.epic ? (
          <Icon name="queue-list" size="small" />
        ) : (
          <Icon name="play" size="small" />
        )}
        <Text fontFamily="mono" fontSize="small" color="muted">
          T{row.number}
        </Text>
        <Stack gap={0} minInlineSize={0} flex={1}>
          <Inline gap={2} alignY="center">
            <Text
              truncate
              fontWeight="medium"
              className={row.epic ? strongColor[row.epic.color] : undefined}
            >
              {row.title}
            </Text>
            <Pips row={row} />
          </Inline>
          <Text truncate fontSize="small" color="muted">
            {row.line} · {ago(row.minutes)} · {usd(row.cost)}
          </Text>
        </Stack>
      </Inline>
      <Inline gap={2} alignY="center" flexWrap="nowrap">
        {needsYouChild && (
          <Tag
            intent="warning"
            startSlot={<Icon name="arrow-up" size="small" />}
          >
            needs you
          </Tag>
        )}
        {row.pr && <Text fontSize="small">PR {row.pr}</Text>}
        <Tag intent={sectionIntent[row.section]}>{row.section}</Tag>
      </Inline>
    </Inline>
  );
  return (
    <Box
      asChild
      paddingBlock={2}
      paddingInline={3}
      borderRadius={2}
      backgroundColor={modeColors.raised}
      boxShadow={1}
      className={row.epic ? styles.epicEdge[row.epic.color] : styles.row}
    >
      <li>
        {row.epic ? (
          <details>
            <Box asChild className={styles.summary}>
              <summary>{head}</summary>
            </Box>
            <Stack
              gap={1}
              paddingBlockStart={2}
              paddingInlineStart={6}
              listStyle="none"
              role="list"
              asChild
            >
              <ul>
                {row.epic.children.map((child) => (
                  <li key={child.number}>
                    <Inline gap={2} alignY="center">
                      <span
                        className={`${styles.pip} ${styles.pipState[child.state]}`}
                      />
                      <Text fontSize="small" fontFamily="mono" color="muted">
                        T{child.number}
                      </Text>
                      <Text fontSize="small">{child.title}</Text>
                      <Text fontSize="small" color="muted">
                        {child.state}
                      </Text>
                    </Inline>
                  </li>
                ))}
              </ul>
            </Stack>
          </details>
        ) : (
          head
        )}
      </li>
    </Box>
  );
};

const childNeedsYou = (row: FlightRow) =>
  row.epic?.children.some((c) => c.state === 'needs-you') ?? false;

const InFlight: FC<{ s: Scenario }> = ({ s }) =>
  s.inFlight.length === 0 ? (
    <Text color="muted">Nothing running.</Text>
  ) : (
    <Stack gap={1} listStyle="none" role="list" asChild>
      <ul>
        {s.inFlight.map((row) => (
          <FlightRowView
            key={row.number}
            row={row}
            needsYouChild={childNeedsYou(row)}
          />
        ))}
      </ul>
    </Stack>
  );

const NeedsYou: FC<{ s: Scenario; Row: FC<{ item: NeedItem }> }> = ({
  s,
  Row,
}) =>
  needsYouCount(s) === 0 ? (
    <Inline gap={2} alignY="center">
      <Icon name="check-circle" size="small" color={modeColors.success} />
      <Text color="muted">Nothing needs you.</Text>
    </Inline>
  ) : (
    <Stack gap={3}>
      <NeedGroup title="Action needed" items={s.actionNeeded} Row={Row} />
      <NeedGroup title="Review" items={s.review} Row={Row} />
      <NeedGroup title="Intake" items={s.intake} Row={Row} />
    </Stack>
  );

const VariantA: FC<{ s: Scenario }> = ({ s }) => (
  <Stack gap={6}>
    <Section title="Needs you" count={needsYouCount(s)}>
      <NeedsYou s={s} Row={NeedRowA} />
    </Section>
    <Section title="In flight" count={s.inFlight.length}>
      <InFlight s={s} />
    </Section>
    <Stack gap={2}>
      <Collapsed title="Your work" kind="your-work" tickets={s.yourWork} />
      <Collapsed title="Queued" kind="queued" tickets={s.queued} />
      <Collapsed title="Done" kind="done" tickets={s.done} />
    </Stack>
  </Stack>
);

// ── Variant B: two panes, Needs you beside the pipeline ───────────────

const NeedCardB: FC<{ item: NeedItem }> = ({ item }) => (
  <Box
    asChild
    padding={3}
    borderRadius={3}
    backgroundColor={modeColors.raised}
    boxShadow={2}
    className={item.epic ? styles.epicEdge[item.epic.color] : styles.row}
  >
    <li>
      <Stack gap={2}>
        <Inline gap={2} alignY="center">
          <Icon name={kindIcon[item.kind]} size="small" />
          <Text fontSize="small" fontWeight="strong">
            {kindLabel[item.kind]}
          </Text>
          <Text fontSize="small" color="muted">
            {ago(item.waiting)}
          </Text>
          <EpicTag item={item} />
        </Inline>
        <Text fontWeight="medium">
          T{item.number} {item.title}
        </Text>
        <Text fontSize="small" color="muted">
          {item.line}
        </Text>
        <NeedActions item={item} />
      </Stack>
    </li>
  </Box>
);

const VariantB: FC<{ s: Scenario }> = ({ s }) => (
  <Grid gap={6}>
    <GridItem colSpan={[12, 12, 5]}>
      <Box backgroundColor={modeColors.sunken} borderRadius={3} padding={4}>
        <Section title="Needs you" count={needsYouCount(s)}>
          <NeedsYou s={s} Row={NeedCardB} />
        </Section>
      </Box>
    </GridItem>
    <GridItem colSpan={[12, 12, 7]}>
      <Stack gap={5}>
        <Section title="In flight" count={s.inFlight.length}>
          <InFlight s={s} />
        </Section>
        <Collapsed title="Queued" kind="queued" tickets={s.queued} />
        <Collapsed title="Your work" kind="your-work" tickets={s.yourWork} />
        <Collapsed title="Done" kind="done" tickets={s.done} />
      </Stack>
    </GridItem>
  </Grid>
);

// ── Variant C: one queue, no sections, sorted by urgency ──────────────

type QueueRow = {
  key: string;
  icon: IconName;
  number: number;
  title: string;
  state: string;
  intent: 'warning' | 'info' | 'primary' | 'neutral' | 'success';
  detail: string;
  color?: PaletteColor;
  action?: ReactNode;
};

const queueOf = (s: Scenario): QueueRow[] => [
  ...[...s.actionNeeded, ...s.review, ...s.intake].map(
    (item): QueueRow => ({
      key: `n${item.number}`,
      icon: kindIcon[item.kind],
      number: item.number,
      title: item.title,
      state: kindLabel[item.kind],
      intent:
        item.kind === 'review'
          ? 'info'
          : item.kind === 'intake'
            ? 'neutral'
            : 'warning',
      detail: `${item.line} · waiting ${ago(item.waiting)}`,
      color: item.epic?.color,
      action: <NeedActions item={item} />,
    }),
  ),
  ...s.inFlight
    .filter((row) => row.section === 'Running' || row.epic)
    .map(
      (row): QueueRow => ({
        key: `f${row.number}`,
        icon: row.epic ? 'queue-list' : 'play',
        number: row.number,
        title: row.epic
          ? `${row.title} (${row.epic.children.filter((c) => c.state === 'done').length}/${row.epic.children.length})`
          : row.title,
        state: row.section,
        intent: 'primary',
        detail: `${row.line} · ${ago(row.minutes)} · ${usd(row.cost)}`,
        color: row.epic?.color,
      }),
    ),
  ...s.queued.map(
    (t, i): QueueRow => ({
      key: `q${t.number}`,
      icon: 'clock',
      number: t.number,
      title: t.title,
      state: `Queued #${i + 1}`,
      intent: 'neutral',
      detail: 'ready-for-agent',
      color: t.epic?.color,
    }),
  ),
];

const VariantC: FC<{ s: Scenario }> = ({ s }) => (
  <Stack gap={4}>
    <Box borderRadius={3} backgroundColor={modeColors.raised} boxShadow={1}>
      <Stack gap={0} listStyle="none" role="list" asChild>
        <ol>
          {queueOf(s).map((row) => (
            <Box
              key={row.key}
              asChild
              paddingBlock={2}
              paddingInline={3}
              className={row.color ? styles.epicEdge[row.color] : styles.row}
            >
              <li>
                <Inline gap={3} alignY="center" flexWrap="nowrap">
                  <Icon name={row.icon} size="small" />
                  <Box minInlineSize={0} flex={1}>
                    <Text truncate>
                      <Text tag="span" fontFamily="mono" color="muted">
                        T{row.number}
                      </Text>{' '}
                      {row.title}
                    </Text>
                    <Text truncate fontSize="small" color="muted">
                      {row.detail}
                    </Text>
                  </Box>
                  <Tag intent={row.intent}>{row.state}</Tag>
                  <Box display={['none', 'block']}>{row.action}</Box>
                </Inline>
              </li>
            </Box>
          ))}
        </ol>
      </Stack>
    </Box>
    <Inline gap={2}>
      <Collapsed title="Your work" kind="your-work" tickets={s.yourWork} />
      <Collapsed title="Done" kind="done" tickets={s.done} />
    </Inline>
  </Stack>
);

// ── The page body and the switcher ────────────────────────────────────

const rendered: Record<VariantKey, FC<{ s: Scenario }>> = {
  A: VariantA,
  B: VariantB,
  C: VariantC,
};

const Switcher: FC<{ variant: VariantKey; scenario: ScenarioKey }> = ({
  variant,
  scenario,
}) => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const go = (key: 'variant' | 'scenario', value: string) => {
    const next = new URLSearchParams(searchParams);
    next.set(key, value);
    router.replace(`${pathname}?${next}`, { scroll: false });
  };

  const step = (by: number) => {
    const index = variantKeys.indexOf(variant);
    const n = variantKeys.length;
    go('variant', variantKeys[(index + by + n) % n]);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.closest('input, textarea, select, [contenteditable]') ||
        (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')
      ) {
        return;
      }
      step(event.key === 'ArrowLeft' ? -1 : 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (process.env.NODE_ENV === 'production') {
    return null;
  }

  return (
    <div className={styles.switcher}>
      <Inline gap={3} alignY="center" flexWrap="nowrap">
        <IconButton
          variant="ghost"
          intent="inherit"
          shape="circle"
          size="small"
          label="Previous variant"
          onClick={() => step(-1)}
        >
          <Icon name="chevron-left" size="small" />
        </IconButton>
        <Text fontWeight="strong" whiteSpace="nowrap" color="inverse">
          {variant} ({variants[variant]})
        </Text>
        <IconButton
          variant="ghost"
          intent="inherit"
          shape="circle"
          size="small"
          label="Next variant"
          onClick={() => step(1)}
        >
          <Icon name="chevron-right" size="small" />
        </IconButton>
        <Select
          size="small"
          aria-label="Scenario"
          value={scenario}
          onChange={(event) => go('scenario', event.target.value)}
        >
          {scenarioKeys.map((key) => (
            <option key={key} value={key}>
              {scenarios[key].label}
            </option>
          ))}
        </Select>
      </Inline>
    </div>
  );
};

type CockpitPrototypeProps = {
  variant?: string;
  scenario?: string;
};

export const CockpitPrototype: FC<CockpitPrototypeProps> = ({
  variant: rawVariant,
  scenario: rawScenario,
}) => {
  const variant: VariantKey = variantKeys.includes(rawVariant as VariantKey)
    ? (rawVariant as VariantKey)
    : 'A';
  const scenario: ScenarioKey = scenarioKeys.includes(
    rawScenario as ScenarioKey,
  )
    ? (rawScenario as ScenarioKey)
    : 'busy';
  const s = scenarios[scenario];
  const Variant = rendered[variant];
  const count = needsYouCount(s);

  // The tab title carries the Needs you count, as T1105 will.
  useEffect(() => {
    document.title = `${count > 0 ? `(${count}) ` : ''}Cockpit prototype · Tandembike`;
  }, [count]);

  return (
    <Stack gap={5} paddingBlockEnd={8}>
      <Alert intent="info">
        Prototype (T1103): fixture data, actions do nothing. Switch layout and
        scenario in the bar at the bottom, or with ← →.
      </Alert>
      {s.cycle ? (
        <>
          <Header s={s} />
          <Variant s={s} />
        </>
      ) : (
        <NoCycle />
      )}
      <Switcher variant={variant} scenario={scenario} />
    </Stack>
  );
};
