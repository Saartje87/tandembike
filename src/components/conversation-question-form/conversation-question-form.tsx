'use client';

import {
  Alert,
  Button,
  Checkbox,
  Inline,
  Radio,
  Stack,
  Text,
  TextInput,
} from '@blockle/blocks';
import { type FC, useId } from 'react';
import { useForm } from 'react-hook-form';

import { answerConversationQuestion } from '../../app/conversations/actions';
import type { QuestionEntry } from '../../conversations/conversation-state';

export type ConversationQuestionFormProps = {
  entryId: number;
  question: QuestionEntry;
};

type Values = {
  answers: { choice: string; choices: string[]; other: string }[];
};

/**
 * One question's answer from what the form holds: the Other text when given
 * (for several choices, after them), else the choice. Empty when unanswered.
 */
const answerOf = (
  multiSelect: boolean,
  { choice, choices, other }: Values['answers'][number],
): string => {
  const typed = other.trim();
  if (!multiSelect) {
    return typed === '' ? choice : typed;
  }
  return [...(choices ?? []), ...(typed === '' ? [] : [typed])].join(', ');
};

/**
 * An Agent's AskUserQuestion in the chat. Answered, it shows each question
 * with its answer. Pending, a single single-choice question is answered by
 * one click on a choice; otherwise each question gets its row of choices
 * (checkboxes where several are allowed) and an Other field, and Submit
 * becomes active once every question has an answer.
 */
export const ConversationQuestionForm: FC<ConversationQuestionFormProps> = ({
  entryId,
  question: { questions, answers, expired },
}) => {
  const id = useId();
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    setError,
    watch,
  } = useForm<Values>({
    defaultValues: {
      answers: questions.map(() => ({ choice: '', choices: [], other: '' })),
    },
  });
  const values = watch('answers');

  const send = async (given: Record<string, string>) => {
    const result = await answerConversationQuestion({
      entryId,
      answers: given,
    });
    if (!result.ok) {
      setError('root.server', { message: result.error });
    }
  };

  const submit = handleSubmit(({ answers: current }) =>
    send(
      Object.fromEntries(
        questions.map(({ question, multiSelect }, index) => [
          question,
          answerOf(multiSelect, current[index]),
        ]),
      ),
    ),
  );

  if (answers !== null) {
    return (
      <Stack gap={1} listStyle="none" role="list" asChild>
        <ul aria-label="Answers">
          {questions.map(({ question }) => (
            <li key={question}>
              <Text tag="p" fontSize="small" color="muted">
                {question}
              </Text>
              <Text tag="p" fontWeight="strong">
                {answers[question]}
              </Text>
            </li>
          ))}
        </ul>
      </Stack>
    );
  }

  if (expired) {
    return (
      <Stack gap={1}>
        {questions.map(({ question }) => (
          <Text key={question}>{question}</Text>
        ))}
        <Text fontSize="small" color="muted">
          Not answered
        </Text>
      </Stack>
    );
  }

  const [only] = questions;
  const oneClick = questions.length === 1 && !only.multiSelect;
  const complete = questions.every(
    ({ multiSelect }, index) =>
      answerOf(
        multiSelect,
        values[index] ?? { choice: '', choices: [], other: '' },
      ) !== '',
  );
  const error = errors.root?.server?.message;

  return (
    <form onSubmit={submit}>
      <Stack gap={3}>
        {questions.map(({ question, header, options, multiSelect }, index) => (
          <Stack
            key={question}
            gap={1}
            asChild
            // A fieldset names its group of choices for assistive technology.
          >
            <fieldset>
              <Text fontWeight="strong" asChild>
                <legend>{question}</legend>
              </Text>
              <Text fontSize="small" color="muted">
                {header}
              </Text>
              {oneClick ? (
                <Inline gap={2} flexWrap="wrap">
                  {options.map(({ label, description }) => (
                    <Button
                      key={label}
                      type="button"
                      size="small"
                      variant="outline"
                      title={description}
                      disabled={isSubmitting}
                      onClick={() => send({ [question]: label })}
                    >
                      {label}
                    </Button>
                  ))}
                </Inline>
              ) : (
                <Stack gap={1}>
                  {options.map(({ label, description }) => (
                    <Stack key={label} gap={0}>
                      {multiSelect ? (
                        <Checkbox
                          {...register(`answers.${index}.choices`)}
                          value={label}
                        >
                          {label}
                        </Checkbox>
                      ) : (
                        <Radio
                          {...register(`answers.${index}.choice`)}
                          value={label}
                        >
                          {label}
                        </Radio>
                      )}
                      <Text fontSize="small" color="muted">
                        {description}
                      </Text>
                    </Stack>
                  ))}
                </Stack>
              )}
              <TextInput
                {...register(`answers.${index}.other`)}
                aria-label={`Other answer to ${question}`}
                placeholder="Other"
                id={`${id}-other-${index}`}
              />
            </fieldset>
          </Stack>
        ))}
        {error && <Alert intent="danger">{error}</Alert>}
        <Inline gap={2} alignX="end">
          <Button
            type="submit"
            size="small"
            loading={isSubmitting}
            disabled={isSubmitting || !complete}
          >
            {oneClick ? 'Send answer' : 'Submit'}
          </Button>
        </Inline>
      </Stack>
    </form>
  );
};
