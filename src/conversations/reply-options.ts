export type ReplyOption = { key: string; text: string };

/** One question and the options listed under it. */
export type ReplyQuestion = {
  /** The question's number, set when the message asks several (`Q1`). */
  label: string | null;
  options: ReplyOption[];
};

type Item = { indent: number; key: string; text: string; numbered: boolean };

const itemPattern = /^(\s*)(?:Q)?(\d+|[A-Za-z])[.)]\s+(\S.*)$/;

const itemOf = (line: string): Item | null => {
  const match = itemPattern.exec(line);
  if (!match) {
    return null;
  }
  const [, space, key, text] = match;
  const numbered = /^\d+$/.test(key);
  return {
    indent: space.length,
    key: numbered ? key : key.toLowerCase(),
    text,
    numbered,
  };
};

/** The numbered or lettered items that end the text, if any. */
const trailingItems = (text: string): Item[] => {
  const items: Item[] = [];
  const lines = text.split('\n');
  for (let index = lines.length - 1; index >= 0; index--) {
    if (lines[index].trim() === '') {
      if (items.length === 0) {
        continue;
      }
      break;
    }
    const item = itemOf(lines[index]);
    if (!item) {
      break;
    }
    items.unshift(item);
  }
  return items;
};

/**
 * The options a message ends with: a numbered (`1.`) or lettered (`a)`) list,
 * as one question; or several numbered questions that each list their own
 * options below, as one question each. Null when the message ends with no
 * such list.
 */
export function replyQuestions(text: string): ReplyQuestion[] | null {
  const items = trailingItems(text);
  const top = Math.min(...items.map(({ indent }) => indent));
  const heads = items.filter(({ indent }) => indent === top);
  const nested = items.filter(({ indent }) => indent > top);

  if (nested.length > 0 && heads.every(({ numbered }) => numbered)) {
    const questions: ReplyQuestion[] = [];
    for (const item of items) {
      if (item.indent === top) {
        questions.push({ label: `Q${item.key}`, options: [] });
      } else {
        questions.at(-1)?.options.push({ key: item.key, text: item.text });
      }
    }
    const asked = questions.filter(({ options }) => options.length > 0);
    return asked.length > 0 ? asked : null;
  }

  // A single flat list: the items of the last kind at the outer indent.
  const kind = heads.at(-1)?.numbered;
  const options = heads
    .filter(({ numbered }) => numbered === kind)
    .map(({ key, text }) => ({ key, text }));
  return options.length >= 2 ? [{ label: null, options }] : null;
}
