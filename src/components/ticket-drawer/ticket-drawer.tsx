'use client';

import {
  Alert,
  Box,
  Button,
  Drawer,
  Grid,
  GridItem,
  Heading,
  Inline,
  Label,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
  VisuallyHidden,
} from '@blockle/blocks';
import { useRouter } from 'next/navigation';
import {
  type FC,
  type FormEvent,
  type ReactNode,
  useEffect,
  useId,
  useLayoutEffect,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from 'react';
import { useForm } from 'react-hook-form';

import { projectPath, ticketOnBoardPath } from '../../app/lib/paths';
import {
  archiveTicket,
  clearTicketClaim,
  restoreTicket,
  updateTicket,
} from '../../app/tickets/actions';
import type { Cycle } from '../../tickets/cycles';
import type {
  Blockers,
  Comment,
  Project,
  Ticket,
  TicketClaim,
} from '../../tickets/tickets';
import { AcceptanceCriteriaEditor } from '../acceptance-criteria-editor/acceptance-criteria-editor';
import { BlockerEditor } from '../blocker-editor/blocker-editor';
import { CopyTicketNumber } from '../copy-ticket-number/copy-ticket-number';
import { CyclePlanner } from '../cycle-planner/cycle-planner';
import { DateTime } from '../date-time/date-time';
import { DeleteTicketDialog } from '../delete-ticket-dialog/delete-ticket-dialog';
import { EpicChildren } from '../epic-children/epic-children';
import { FieldError } from '../field-error/field-error';
import { Icon } from '../icon/icon';
import { LabelEditor } from '../label-editor/label-editor';
import { Markdown } from '../markdown/markdown';
import { StatusSelect } from '../status-select/status-select';
import { TicketComments } from '../ticket-comments/ticket-comments';
import { TicketEpic } from '../ticket-epic/ticket-epic';
import { claimEscape, keepDrawerOpen } from './keep-drawer-open';
import * as styles from './ticket-drawer.css';

export type TicketDrawerProps = {
  ticket: Ticket;
  /** Every Project, to move the Ticket to. */
  projects: Project[];
  /** Every label in use, suggested when adding one. Defaults to none. */
  allLabels?: string[];
  /** The Ticket's comments, oldest first. Defaults to none. */
  comments?: Comment[];
  /** The Ticket's blocking relationships. Defaults to none. */
  blockers?: Blockers;
  /** The Cycles of the Ticket's Project, to plan it into. Defaults to none. */
  cycles?: Cycle[];
  /** The Claim on the Ticket's Epic, which covers it too. Defaults to none. */
  epicClaim?: TicketClaim | null;
  /**
   * The URL of the Board the drawer is open over, without `?ticket=`: where
   * closing goes. Defaults to the Ticket's Project's Backlog, as it does
   * after a move.
   */
  boardPath?: string;
};

/** The fields the drawer saves one at a time. */
type Fields = Pick<Ticket, 'title' | 'description' | 'status' | 'projectId'>;

/** One field's new value. */
type Edit = { [Field in keyof Fields]: Pick<Fields, Field> }[keyof Fields];

/** The fields saved as soon as they change, whose errors the drawer keeps. */
type DetailField = 'status' | 'projectId';

type DetailEdit = Pick<Fields, 'status'> | Pick<Fields, 'projectId'>;

type DetailErrors = Partial<Record<DetailField, string>>;

/** Saves one field; `onRefused` gets the reason when the server refuses it. */
type SaveField = (edit: Edit, onRefused: (reason: string) => void) => void;

function fieldsOf(ticket: Ticket): Fields {
  return {
    title: ticket.title,
    description: ticket.description,
    status: ticket.status,
    projectId: ticket.projectId,
  };
}

function fieldOf(edit: Edit): keyof Fields {
  return Object.keys(edit)[0] as keyof Fields;
}

/**
 * Whether the drawer is on screen: `false` on the server, during hydration
 * and while Next.js keeps the route hidden in an `<Activity>` after the User
 * navigates away; `true` otherwise. Effects run only for a visible route, so
 * the layout effect turns it on and its cleanup turns it off.
 *
 * Blocks' `Drawer` opens with `showModal()`, which throws on a dialog that is
 * already open, and it neither closes on hide nor accepts a server-rendered
 * `<dialog open>`. Rendering it only while shown gives every reveal a fresh
 * dialog and takes a hidden one out of the top layer.
 */
const useIsShown = () => {
  const [shown, setShown] = useState(false);
  useLayoutEffect(() => {
    setShown(true);
    return () => setShown(false);
  }, []);
  return shown;
};

type TitleFieldProps = {
  title: string;
  onSave: SaveField;
};

/**
 * The title as the drawer's heading. Clicking it, or Enter on it, turns it
 * into an input; Enter or leaving the input saves and Escape cancels. A
 * refused title opens the input again with the User's text.
 */
const TitleField: FC<TitleFieldProps> = ({ title, onSave }) => {
  const inputId = useId();
  const errorId = useId();
  const hintId = useId();
  const [editing, setEditing] = useState(false);
  const [refocus, setRefocus] = useState(false);
  // Ending the edit unmounts the input, which can blur it once more.
  const acceptingSubmit = useRef(false);
  // The form outlives the input, which closes on submit while the title
  // saves. It has no pending state: the optimistic title shows instead.
  const {
    formState: { errors },
    handleSubmit,
    register,
    reset,
    setError,
  } = useForm<{ title: string }>({
    defaultValues: { title },
    // A refused title keeps its reason until the edit ends.
    reValidateMode: 'onSubmit',
  });
  const error = errors.title?.message;

  const begin = () => {
    acceptingSubmit.current = true;
    setEditing(true);
  };
  const end = (refocusTitle: boolean) => {
    acceptingSubmit.current = false;
    setEditing(false);
    setRefocus(refocusTitle);
  };
  const submit = (refocusTitle: boolean, event?: FormEvent) => {
    event?.preventDefault();
    if (!acceptingSubmit.current) {
      return;
    }
    end(refocusTitle);
    void handleSubmit(({ title: text }) => {
      if (text === title) {
        reset({ title });
        return;
      }
      onSave({ title: text }, (reason) => {
        reset({ title: text });
        setError('title', { type: 'server', message: reason });
        begin();
      });
    })();
  };
  const cancel = () => {
    end(true);
    reset({ title });
  };

  if (!editing) {
    return (
      <>
        <Heading level={2} fontSize="xlarge" fontWeight="strong">
          <button
            type="button"
            className={styles.titleButton}
            aria-describedby={hintId}
            // biome-ignore lint/a11y/noAutofocus: only after the User ends an edit, to put focus back where it was.
            autoFocus={refocus}
            onClick={(event) => {
              keepDrawerOpen(event);
              reset({ title });
              begin();
            }}
          >
            {title}
          </button>
        </Heading>
        <VisuallyHidden id={hintId}>Edit title</VisuallyHidden>
      </>
    );
  }

  return (
    <form onSubmit={(event) => submit(true, event)}>
      <Stack gap={1}>
        <Label htmlFor={inputId}>
          <VisuallyHidden>Title</VisuallyHidden>
        </Label>
        <TextInput
          {...register('title', { onBlur: () => submit(false) })}
          id={inputId}
          onKeyDown={(event) => {
            if (claimEscape(event)) {
              cancel();
            }
          }}
          inputClassName={styles.titleInput}
          autoComplete="off"
          autoFocus
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
        />
        <FieldError id={errorId} reason={error} />
      </Stack>
    </form>
  );
};

type DescriptionFieldProps = {
  description: string;
  onSave: SaveField;
  /** Whether the edit in progress has unsaved text, so the drawer can guard closing. */
  onUnsavedChange: (unsaved: boolean) => void;
};

/**
 * The description as Markdown with an Edit button that swaps in a textarea
 * with Save and Cancel. Cmd/Ctrl+Enter saves and Escape cancels. A refused
 * description opens the textarea again with the User's text.
 */
const DescriptionField: FC<DescriptionFieldProps> = ({
  description,
  onSave,
  onUnsavedChange,
}) => {
  const headingId = useId();
  const errorId = useId();
  const [editing, setEditing] = useState(false);
  const [refocus, setRefocus] = useState(false);
  // The form outlives the textarea, which closes on submit while the
  // description saves. It has no pending state: the optimistic description
  // shows instead.
  const {
    formState: { defaultValues, errors, isDirty },
    handleSubmit,
    register,
    reset,
    setError,
    setValue,
  } = useForm<{ description: string }>({
    defaultValues: { description },
    // A refused description keeps its reason until the edit ends.
    reValidateMode: 'onSubmit',
  });
  const error = errors.description?.message;

  // Dirty against the description the edit began with, so text typed back
  // to it counts as unchanged.
  const unsaved = editing && isDirty;
  useEffect(() => onUnsavedChange(unsaved), [unsaved, onUnsavedChange]);

  const end = () => {
    setEditing(false);
    setRefocus(true);
  };
  const save = handleSubmit(({ description: text }) => {
    end();
    // The description when the edit began, which may since have changed elsewhere.
    const original = defaultValues?.description ?? description;
    if (text === original) {
      reset({ description });
      return;
    }
    onSave({ description: text }, (reason) => {
      reset({ description: original });
      setValue('description', text, { shouldDirty: true });
      setError('description', { type: 'server', message: reason });
      setEditing(true);
    });
  });
  const cancel = () => {
    end();
    reset({ description });
  };

  let body: ReactNode;
  if (editing) {
    body = (
      <form
        onSubmit={save}
        onKeyDown={(event) => {
          if (claimEscape(event)) {
            cancel();
          } else if (
            event.key === 'Enter' &&
            (event.metaKey || event.ctrlKey)
          ) {
            event.preventDefault();
            event.currentTarget.requestSubmit();
          }
        }}
      >
        <Stack gap={2}>
          <Textarea
            {...register('description')}
            rows={12}
            autoFocus
            aria-labelledby={headingId}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
          />
          <Inline gap={2}>
            <Button type="submit" size="small" onClick={keepDrawerOpen}>
              Save
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="small"
              onClick={(event) => {
                keepDrawerOpen(event);
                cancel();
              }}
            >
              Cancel
            </Button>
          </Inline>
        </Stack>
      </form>
    );
  } else if (description === '') {
    body = (
      <Text tag="p" color="text-600">
        No description
      </Text>
    );
  } else {
    body = <Markdown headingLevel={4}>{description}</Markdown>;
  }

  return (
    <Stack gap={2}>
      <Inline gap={2} alignY="center" justifyContent="space-between">
        <Heading id={headingId} level={3} fontSize="medium">
          Description
        </Heading>
        {!editing && (
          <Button
            type="button"
            variant="ghost"
            size="small"
            autoFocus={refocus}
            onClick={(event) => {
              keepDrawerOpen(event);
              reset({ description });
              setEditing(true);
            }}
          >
            Edit description
          </Button>
        )}
      </Inline>
      {body}
      <FieldError id={errorId} reason={error} />
    </Stack>
  );
};

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
  <Text fontSize="small" color="text-600">
    {children}
  </Text>
);

const noBlockers: Blockers = { blockedBy: [], blocks: [] };

const noCycles: Cycle[] = [];

/** The drawer itself, with its edits, for as long as it is shown. */
const OpenDrawer: FC<TicketDrawerProps> = ({
  ticket,
  projects,
  allLabels = [],
  comments = [],
  blockers = noBlockers,
  cycles = noCycles,
  epicClaim = null,
  boardPath,
}) => {
  const router = useRouter();
  const statusId = useId();
  const statusErrorId = useId();
  const projectId = useId();
  const projectErrorId = useId();
  const [currentProjectId, setCurrentProjectId] = useState(ticket.projectId);
  const [fields, showEdit] = useOptimistic(
    fieldsOf(ticket),
    (current, edit: Edit): Fields => ({ ...current, ...edit }),
  );
  const [errors, setErrors] = useState<DetailErrors>({});
  const [unsavedDescription, setUnsavedDescription] = useState(false);
  const [, startSave] = useTransition();
  const [archived, showArchived] = useOptimistic(ticket.archived);
  const [archiveError, setArchiveError] = useState<string>();
  const [archivePending, startArchive] = useTransition();
  const [claim, showClaim] = useOptimistic(ticket.claim);
  const [claimError, setClaimError] = useState<string>();
  const [claimPending, startClaimClear] = useTransition();

  // Closing replaces the URL (ADR 0013), so Back does not reopen the drawer,
  // and keeps the Board's scroll position, which Next resets by default.
  const close = () => {
    router.replace(
      boardPath !== undefined && currentProjectId === ticket.projectId
        ? boardPath
        : projectPath(currentProjectId),
      { scroll: false },
    );
  };
  const requestClose = () => {
    // The Blocks `Drawer` does not join `Dialog`'s nesting, so an Escape or
    // outside click meant for a dialog in it (Delete) reaches the drawer
    // first. Leave that one to the dialog (docs/blocks-feedback.md, 17).
    if (document.querySelector('dialog[data-ticket-drawer] dialog[open]')) {
      return;
    }
    if (
      unsavedDescription &&
      !window.confirm('Discard changes to the description?')
    ) {
      return;
    }
    close();
  };

  const setDetailError = (field: DetailField, message: string | undefined) =>
    setErrors((current) => ({ ...current, [field]: message }));

  const save: SaveField = (edit, onRefused) => {
    const field = fieldOf(edit);
    startSave(async () => {
      showEdit(edit);
      const result = await updateTicket({ number: ticket.number, ...edit });
      if (!result.ok) {
        onRefused(result.fieldErrors?.[field] ?? result.error);
        return;
      }
      if (result.projectId !== currentProjectId) {
        setCurrentProjectId(result.projectId);
        // It left every Cycle, so its own Board is the new Project's Backlog.
        router.replace(
          ticketOnBoardPath(projectPath(result.projectId), ticket.number),
          { scroll: false },
        );
      }
    });
  };

  const saveDetail = (edit: DetailEdit) => {
    const field = fieldOf(edit) as DetailField;
    setDetailError(field, undefined);
    save(edit, (reason) => setDetailError(field, reason));
  };

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
    <Drawer
      open
      onRequestClose={requestClose}
      placement="right"
      aria-label={fields.title}
      data-ticket-drawer=""
    >
      <Box padding={5}>
        <Stack gap={5}>
          <Stack gap={3}>
            <Inline gap={2} alignY="center" justifyContent="space-between">
              <CopyTicketNumber number={ticket.number} />
              <Button
                type="button"
                variant="ghost"
                size="small"
                aria-label="Close"
                onClick={requestClose}
              >
                <Icon name="x-mark" size="small" />
              </Button>
            </Inline>
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
                    onClick={(event) => {
                      keepDrawerOpen(event);
                      toggleArchived();
                    }}
                  >
                    Restore
                  </Button>
                </Inline>
              </Alert>
            )}
            <TitleField title={fields.title} onSave={save} />
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
                    onChange={(status) => saveDetail({ status })}
                    aria-invalid={errors.status ? true : undefined}
                    aria-describedby={errors.status ? statusErrorId : undefined}
                  />
                  <FieldError id={statusErrorId} reason={errors.status} />
                </Stack>
              </Detail>
            )}
            <Detail
              name={
                <Label htmlFor={projectId}>
                  <DetailName>Project</DetailName>
                </Label>
              }
            >
              <Stack gap={1}>
                <Select
                  id={projectId}
                  name="projectId"
                  value={fields.projectId}
                  onChange={(event) =>
                    saveDetail({ projectId: Number(event.currentTarget.value) })
                  }
                  aria-invalid={errors.projectId ? true : undefined}
                  aria-describedby={
                    errors.projectId ? projectErrorId : undefined
                  }
                >
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </Select>
                <FieldError id={projectErrorId} reason={errors.projectId} />
              </Stack>
            </Detail>
            {ticket.type === 'Epic' ? (
              <Detail name={<DetailName>Type</DetailName>}>
                <Text>Epic</Text>
              </Detail>
            ) : (
              <Detail name={<DetailName>Epic</DetailName>}>
                <TicketEpic ticket={ticket} />
              </Detail>
            )}
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
                    onClick={(event) => {
                      keepDrawerOpen(event);
                      clearClaim();
                    }}
                  >
                    {claimPending ? 'Clearing claim...' : 'Clear claim'}
                  </Button>
                )}
                {claimError && <Alert intent="error">{claimError}</Alert>}
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
            <EpicChildren
              epic={{ ...ticket, archived }}
              items={ticket.children}
            />
          )}
          <DescriptionField
            description={fields.description}
            onSave={save}
            onUnsavedChange={setUnsavedDescription}
          />
          <AcceptanceCriteriaEditor
            ticketNumber={ticket.number}
            criteria={ticket.acceptanceCriteria}
          />
          <TicketComments ticketNumber={ticket.number} comments={comments} />
          <Stack gap={2}>
            {archiveError && <Alert intent="error">{archiveError}</Alert>}
            <Inline gap={2} alignY="center" justifyContent="space-between">
              <Text tag="p" fontSize="small" color="text-600">
                Created <DateTime date={ticket.createdAt} /> · Updated{' '}
                <DateTime date={ticket.updatedAt} />
              </Text>
              <Inline gap={2} alignY="center">
                {!archived && (
                  <Button
                    type="button"
                    variant="outline"
                    intent="neutral"
                    size="small"
                    disabled={archivePending}
                    onClick={(event) => {
                      keepDrawerOpen(event);
                      toggleArchived();
                    }}
                  >
                    Archive
                  </Button>
                )}
                <DeleteTicketDialog
                  ticket={{ ...ticket, claim }}
                  blocks={blockers.blocks}
                  epicClaim={epicClaim}
                  onDeleted={close}
                />
              </Inline>
            </Inline>
          </Stack>
        </Stack>
      </Box>
    </Drawer>
  );
};

/**
 * A Ticket in a side drawer over its Board: its number to copy, its title as an
 * in-place editable heading, its Status, Project, Epic (or that it is an
 * Epic), Cycle, labels and Blockers, an Epic's child Tickets, its Markdown
 * description, acceptance criteria and comments, and a footer with its
 * timestamps, Archive and Delete.
 * Each field saves on its own when the User finishes with it, shows the new
 * value at once, and goes back with an error under it when refused. Closing
 * (the Close button, Escape or a click outside) goes to the Ticket's Board,
 * after a confirmation when the description has unsaved changes.
 */
export const TicketDrawer: FC<TicketDrawerProps> = (props) => {
  const shown = useIsShown();
  return shown ? <OpenDrawer key={props.ticket.number} {...props} /> : null;
};
