'use client';

import {
  Alert,
  Button,
  Grid,
  GridItem,
  Heading,
  Inline,
  Label,
  Stack,
  Text,
} from '@blockle/blocks';
import {
  type FC,
  type ReactNode,
  useId,
  useOptimistic,
  useState,
  useTransition,
} from 'react';

import { refusalReason } from '../../app/lib/action-result';
import {
  archiveTicket,
  clearTicketClaim,
  restoreTicket,
  updateTicket,
} from '../../app/tickets/actions';
import type { ActivityEntry } from '../../tickets/activity';
import type { Cycle } from '../../tickets/cycles';
import type { ReferenceTemplateLink } from '../../tickets/external-reference-display';
import {
  type Blockers,
  type Comment,
  type EpicLink,
  epicLinkOf,
  type Ticket,
  type TicketClaim,
} from '../../tickets/tickets';
import { AcceptanceCriteriaEditor } from '../acceptance-criteria-editor/acceptance-criteria-editor';
import { ArchiveEpicDialog } from '../archive-epic-dialog/archive-epic-dialog';
import { BlockerEditor } from '../blocker-editor/blocker-editor';
import { CyclePlanner } from '../cycle-planner/cycle-planner';
import { DateTime } from '../date-time/date-time';
import {
  type ChildDeletion,
  DeleteTicketDialog,
} from '../delete-ticket-dialog/delete-ticket-dialog';
import { EpicChildren } from '../epic-children/epic-children';
import { EpicColorPicker } from '../epic-color-picker/epic-color-picker';
import { ExternalReferenceEditor } from '../external-reference-editor/external-reference-editor';
import { FieldError } from '../field-error/field-error';
import { InlineEdit } from '../inline-edit/inline-edit';
import { LabelEditor } from '../label-editor/label-editor';
import { Markdown } from '../markdown/markdown';
import { SplitOffTickets } from '../split-off-tickets/split-off-tickets';
import { StatusSelect } from '../status-select/status-select';
import { TicketAttachments } from '../ticket-attachments/ticket-attachments';
import { TicketComments } from '../ticket-comments/ticket-comments';
import { useTicketDrawer } from '../ticket-drawer-shell/ticket-drawer-shell';
import { TicketEpic } from '../ticket-epic/ticket-epic';
import { TicketOrigin } from '../ticket-origin/ticket-origin';
import * as styles from './ticket-drawer.css';

export type TicketDrawerProps = {
  ticket: Ticket;
  /** Every label in use, suggested when adding one. Defaults to none. */
  allLabels?: string[];
  /** The Ticket's comments, oldest first. Defaults to none. */
  comments?: Comment[];
  /** The Ticket's Activity, oldest first. Defaults to none. */
  activity?: ActivityEntry[];
  /** The Ticket's blocking relationships. Defaults to none. */
  blockers?: Blockers;
  /** The Cycles of the Ticket's Project, to plan it into. Defaults to none. */
  cycles?: Cycle[];
  /**
   * The live Epics of the Ticket's Project, to attach it to. Defaults to
   * none.
   */
  epics?: EpicLink[];
  /** The Claim on the Ticket's Epic, which covers it too. Defaults to none. */
  epicClaim?: TicketClaim | null;
  /**
   * An Epic's children with their Claims and the Tickets they block, for
   * deleting or archiving them along with it. Defaults to none.
   */
  epicChildren?: ChildDeletion[];
  /**
   * The Reference templates of the Ticket's Project, which link its
   * External reference keys. Defaults to none.
   */
  referenceTemplates?: ReferenceTemplateLink[];
};

/** The fields the drawer saves one at a time. */
type Fields = Pick<Ticket, 'title' | 'description' | 'status'>;

/** One field's new value. */
type Edit = { [Field in keyof Fields]: Pick<Fields, Field> }[keyof Fields];

/** Saves one field; `onRefused` gets the reason when the server refuses it. */
type SaveField = (edit: Edit, onRefused: (reason: string) => void) => void;

function fieldsOf(ticket: Ticket): Fields {
  return {
    title: ticket.title,
    description: ticket.description,
    status: ticket.status,
  };
}

function fieldOf(edit: Edit): keyof Fields {
  return Object.keys(edit)[0] as keyof Fields;
}

type DescriptionFieldProps = {
  description: string;
  onSave: (description: string) => Promise<string | undefined>;
};

/**
 * The description as Markdown that edits in place in a textarea, with a
 * placeholder to add one when it is empty.
 */
const DescriptionField: FC<DescriptionFieldProps> = ({
  description,
  onSave,
}) => (
  <Stack gap={2}>
    <Heading level={3} fontSize="medium">
      Description
    </Heading>
    <InlineEdit
      value={description}
      label="Description"
      onSave={onSave}
      multiline
      renderContent={(text) => <Markdown headingLevel={4}>{text}</Markdown>}
      placeholder="Add a description…"
    />
  </Stack>
);

type DetailProps = {
  /** The detail's name, a `Label` for a control or plain text. */
  name: ReactNode;
  children: ReactNode;
};

/** One name/value row of the details; the name stacks above on mobile. */
const Detail: FC<DetailProps> = ({ name, children }) => (
  <Grid columnGap={3} rowGap={1} alignItems="center">
    <GridItem colSpan={[12, 3]}>{name}</GridItem>
    <GridItem colSpan={[12, 9]}>{children}</GridItem>
  </Grid>
);

type DetailNameProps = { children: ReactNode };

const DetailName: FC<DetailNameProps> = ({ children }) => (
  <Text fontSize="small" color="muted">
    {children}
  </Text>
);

const noBlockers: Blockers = { blockedBy: [], blocks: [] };

const noCycles: Cycle[] = [];

/**
 * A Ticket's details in its drawer, under the number and Close of the
 * `TicketDrawerShell` around it: its title as an in-place editable heading,
 * which names the drawer, its Status, Epic (or that it is an Epic), Origin,
 * Cycle, labels, External references and Blockers, an Epic's child Tickets,
 * the Tickets split from it, its Markdown description, acceptance criteria
 * and comments, and a footer with its timestamps, Archive and Delete.
 * Each field saves on its own when the User finishes with it, shows the new
 * value at once, and goes back with an error under it when refused. A field
 * being edited saves as focus leaves it, as when the drawer closes.
 */
export const TicketDrawer: FC<TicketDrawerProps> = ({
  ticket,
  allLabels = [],
  comments = [],
  activity,
  blockers = noBlockers,
  cycles = noCycles,
  epics,
  epicClaim = null,
  epicChildren,
  referenceTemplates,
}) => {
  const { titleId, close } = useTicketDrawer();
  const statusId = useId();
  const statusErrorId = useId();
  const [fields, showEdit] = useOptimistic(
    fieldsOf(ticket),
    (current, edit: Edit): Fields => ({ ...current, ...edit }),
  );
  const [statusError, setStatusError] = useState<string>();
  const [, startSave] = useTransition();
  const [archived, showArchived] = useOptimistic(ticket.archived);
  const [archiveError, setArchiveError] = useState<string>();
  const [archivePending, startArchive] = useTransition();
  const [claim, showClaim] = useOptimistic(ticket.claim);
  const [claimError, setClaimError] = useState<string>();
  const [claimPending, startClaimClear] = useTransition();

  const save: SaveField = (edit, onRefused) => {
    const field = fieldOf(edit);
    startSave(async () => {
      showEdit(edit);
      const result = await updateTicket({ number: ticket.number, ...edit });
      const reason = refusalReason(result, field);
      if (reason !== undefined) {
        onRefused(reason);
      }
    });
  };

  // Runs inside InlineEdit's save, so the drawer's name follows at once too.
  const saveTitle = async (title: string) => {
    showEdit({ title });
    const result = await updateTicket({ number: ticket.number, title });
    return refusalReason(result, 'title');
  };

  const saveDescription = async (description: string) => {
    showEdit({ description });
    const result = await updateTicket({ number: ticket.number, description });
    return refusalReason(result, 'description');
  };

  const saveStatus = (status: Fields['status']) => {
    setStatusError(undefined);
    save({ status }, setStatusError);
  };

  // An Epic's children that would be archived with it, which it asks about.
  const archivableChildren = ticket.children
    .filter((child) => !child.archived)
    .map(({ number, title, status }) => {
      const detail = epicChildren?.find((each) => each.number === number);
      return {
        number,
        title,
        status,
        claim: detail?.claim ?? null,
        blocks: detail?.blocks ?? [],
      };
    });

  const toggleArchived = () => {
    const next = !archived;
    setArchiveError(undefined);
    startArchive(async () => {
      showArchived(next);
      const action = next ? archiveTicket : restoreTicket;
      const result = await action({ number: ticket.number });
      if (!result.ok) {
        setArchiveError(result.error);
      }
    });
  };

  const clearClaim = () => {
    setClaimError(undefined);
    startClaimClear(async () => {
      showClaim(null);
      const result = await clearTicketClaim({ number: ticket.number });
      if (!result.ok) {
        setClaimError(result.error);
      }
    });
  };

  return (
    <Stack gap={5}>
      <Stack gap={3}>
        {archived && (
          <Alert intent="info">
            <Inline gap={3} alignY="center">
              <Text>This Ticket is archived</Text>
              <Button
                type="button"
                variant="outline"
                intent="neutral"
                size="small"
                disabled={archivePending}
                onClick={toggleArchived}
              >
                Restore
              </Button>
            </Inline>
          </Alert>
        )}
        <InlineEdit
          value={fields.title}
          label="Title"
          onSave={saveTitle}
          wrap={(title) => (
            <Heading
              id={titleId}
              level={2}
              fontSize="xlarge"
              fontWeight="strong"
            >
              {title}
            </Heading>
          )}
          inputClassName={styles.titleInput}
        />
      </Stack>
      <Stack gap={3}>
        {ticket.type === 'Epic' ? (
          <Detail name={<DetailName>Status</DetailName>}>
            <Text>{ticket.status} · follows its child Tickets</Text>
          </Detail>
        ) : (
          <Detail
            name={
              <Label htmlFor={statusId}>
                <DetailName>Status</DetailName>
              </Label>
            }
          >
            <Stack gap={1}>
              <StatusSelect
                id={statusId}
                name="status"
                value={fields.status}
                onChange={saveStatus}
                aria-invalid={statusError ? true : undefined}
                aria-describedby={statusError ? statusErrorId : undefined}
              />
              <FieldError id={statusErrorId} reason={statusError} />
            </Stack>
          </Detail>
        )}
        {ticket.type === 'Epic' ? (
          <>
            <Detail name={<DetailName>Type</DetailName>}>
              <Text>Epic</Text>
            </Detail>
            <Detail name={<DetailName>Colour</DetailName>}>
              <EpicColorPicker
                epic={{
                  number: ticket.number,
                  color: epicLinkOf(ticket).color,
                }}
              />
            </Detail>
          </>
        ) : (
          <Detail name={<DetailName>Epic</DetailName>}>
            <TicketEpic ticket={ticket} epics={epics} />
          </Detail>
        )}
        <Detail name={<DetailName>Origin</DetailName>}>
          <TicketOrigin ticket={ticket} />
        </Detail>
        <Detail name={<DetailName>Cycle</DetailName>}>
          <CyclePlanner ticket={{ ...ticket, archived }} cycles={cycles} />
        </Detail>
        <Detail name={<DetailName>Labels</DetailName>}>
          <LabelEditor
            ticketNumber={ticket.number}
            labels={ticket.labels}
            suggestions={allLabels}
          />
        </Detail>
        <Detail name={<DetailName>External references</DetailName>}>
          <ExternalReferenceEditor
            ticketNumber={ticket.number}
            references={ticket.externalReferences}
            templates={referenceTemplates}
          />
        </Detail>
        <Detail name={<DetailName>Claim</DetailName>}>
          <Stack gap={1}>
            <Text>
              {claim
                ? claim.agentName
                  ? `${claim.agentName} (${claim.agentRunId})`
                  : `Agent run ${claim.agentRunId}`
                : 'Unclaimed'}
            </Text>
            {claim && (
              <Button
                type="button"
                variant="outline"
                intent="neutral"
                size="small"
                disabled={claimPending}
                onClick={clearClaim}
              >
                {claimPending ? 'Clearing claim...' : 'Clear claim'}
              </Button>
            )}
            {claimError && <Alert intent="danger">{claimError}</Alert>}
          </Stack>
        </Detail>
        <Detail name={<DetailName>Blocked by</DetailName>}>
          <BlockerEditor
            ticketNumber={ticket.number}
            direction="blockedBy"
            related={blockers.blockedBy}
          />
        </Detail>
        <Detail name={<DetailName>Blocks</DetailName>}>
          <BlockerEditor
            ticketNumber={ticket.number}
            direction="blocks"
            related={blockers.blocks}
          />
        </Detail>
      </Stack>
      {ticket.type === 'Epic' && (
        <EpicChildren epic={{ ...ticket, archived }} items={ticket.children} />
      )}
      {ticket.splitOff.length > 0 && (
        <SplitOffTickets items={ticket.splitOff} />
      )}
      <DescriptionField
        description={fields.description}
        onSave={saveDescription}
      />
      <TicketAttachments attachments={ticket.attachments} />
      <AcceptanceCriteriaEditor
        ticketNumber={ticket.number}
        criteria={ticket.acceptanceCriteria}
      />
      <TicketComments
        ticketNumber={ticket.number}
        comments={comments}
        activity={activity}
      />
      <Stack gap={2}>
        {archiveError && <Alert intent="danger">{archiveError}</Alert>}
        <Inline gap={2} alignY="center" justifyContent="space-between">
          <Text tag="p" fontSize="small" color="muted">
            Created <DateTime date={ticket.createdAt} /> · Updated{' '}
            <DateTime date={ticket.updatedAt} />
          </Text>
          <Inline gap={2} alignY="center">
            {!archived && archivableChildren.length > 0 && (
              <ArchiveEpicDialog
                epic={{ ...ticket, status: fields.status, claim }}
                blocks={blockers.blocks}
                epicChildren={archivableChildren}
              />
            )}
            {!archived && archivableChildren.length === 0 && (
              <Button
                type="button"
                variant="outline"
                intent="neutral"
                size="small"
                disabled={archivePending}
                onClick={toggleArchived}
              >
                Archive
              </Button>
            )}
            <DeleteTicketDialog
              ticket={{ ...ticket, claim }}
              blocks={blockers.blocks}
              epicClaim={epicClaim}
              epicChildren={epicChildren}
              onDeleted={close}
            />
          </Inline>
        </Inline>
      </Stack>
    </Stack>
  );
};
