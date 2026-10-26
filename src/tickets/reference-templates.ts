import { and, asc, eq, ne } from 'drizzle-orm';

import type { DatabaseConnection } from '../db/connection';
import { referenceTemplates } from '../db/schema';
import { checkProjectWritable } from './archived-projects';
import type { ChangeChannel } from './changes';
import { NotFoundError } from './errors';
import { httpUrl } from './external-reference-display';
import {
  maxExternalReferenceKeyLength,
  maxExternalReferenceUrlLength,
} from './external-references';
import { throwFieldErrors } from './rules';

/**
 * A Project's rule that turns External reference keys starting with
 * `prefix` into `url`, with `{n}` replaced by the rest of the key.
 */
export type ReferenceTemplate = {
  id: number;
  projectId: number;
  /** Trimmed, without spaces, and unique within its Project. */
  prefix: string;
  /** A trimmed absolute http(s) URL containing `{n}`. */
  url: string;
};

export type ReferenceTemplateInput = { prefix: string; url: string };

const templateColumns = {
  id: referenceTemplates.id,
  projectId: referenceTemplates.projectId,
  prefix: referenceTemplates.prefix,
  url: referenceTemplates.url,
};

/** Why trimmed `prefix` breaks the rules, if it does. */
function checkPrefix(prefix: string): string | undefined {
  if (prefix === '') {
    return 'Enter a prefix, such as # or ABC-.';
  }
  if (/\s/.test(prefix)) {
    return 'Keep the prefix to one word without spaces, such as # or ABC-.';
  }
  if (prefix.length > maxExternalReferenceKeyLength) {
    return `Keep the prefix to ${maxExternalReferenceKeyLength} characters or fewer.`;
  }
  return undefined;
}

/** Why trimmed `url` breaks the rules, if it does. */
function checkUrl(url: string): string | undefined {
  if (
    /\s/.test(url) ||
    url.length > maxExternalReferenceUrlLength ||
    httpUrl(url) === null
  ) {
    return `Enter an http(s) URL of at most ${maxExternalReferenceUrlLength.toLocaleString('en-US')} characters, such as https://github.com/owner/repo/issues/{n}.`;
  }
  if (!url.includes('{n}')) {
    return 'Put {n} in the URL where the rest of the key goes, such as https://github.com/owner/repo/issues/{n}.';
  }
  return undefined;
}

/**
 * `input` trimmed, or a `ValidationError` naming each field that breaks a
 * rule. The prefix must be free in Project `projectId`, apart from template
 * `exceptId`, the one being edited.
 */
function checkedTemplate(
  db: DatabaseConnection,
  projectId: number,
  input: ReferenceTemplateInput,
  exceptId?: number,
): ReferenceTemplateInput {
  const prefix = String(input.prefix ?? '').trim();
  const url = String(input.url ?? '').trim();
  const taken =
    db
      .select({ id: referenceTemplates.id })
      .from(referenceTemplates)
      .where(
        and(
          eq(referenceTemplates.projectId, projectId),
          eq(referenceTemplates.prefix, prefix),
          exceptId === undefined
            ? undefined
            : ne(referenceTemplates.id, exceptId),
        ),
      )
      .get() !== undefined;
  throwFieldErrors({
    prefix:
      checkPrefix(prefix) ??
      (taken
        ? `This Project already has a Reference template for ${prefix}. Edit that one instead.`
        : undefined),
    url: checkUrl(url),
  });
  return { prefix, url };
}

/** The Project of Reference template `id`, or a `NotFoundError`. */
function templateProjectId(db: DatabaseConnection, id: number): number {
  const template = db
    .select({ projectId: referenceTemplates.projectId })
    .from(referenceTemplates)
    .where(eq(referenceTemplates.id, id))
    .get();
  if (!template) {
    throw new NotFoundError(`There is no Reference template with id ${id}.`);
  }
  return template.projectId;
}

/** The Tickets module's Reference template functions. Only the User calls them. */
export function createReferenceTemplates(
  db: DatabaseConnection,
  changes: ChangeChannel,
) {
  return {
    /** Project `projectId`'s Reference templates, in the order added. */
    listReferenceTemplates(projectId: number): ReferenceTemplate[] {
      return db
        .select(templateColumns)
        .from(referenceTemplates)
        .where(eq(referenceTemplates.projectId, projectId))
        .orderBy(asc(referenceTemplates.id))
        .all();
    },

    /** Adds a Reference template after Project `projectId`'s others. */
    addReferenceTemplate(
      projectId: number,
      input: ReferenceTemplateInput,
    ): ReferenceTemplate {
      checkProjectWritable(db, projectId);
      const { prefix, url } = checkedTemplate(db, projectId, input);
      const template = db
        .insert(referenceTemplates)
        .values({ projectId, prefix, url })
        .returning(templateColumns)
        .get();
      changes.publish({ type: 'project', id: projectId });
      return template;
    },

    /**
     * Changes Reference template `id`'s prefix and URL by the rules of
     * adding one; it keeps its place in its Project's order.
     */
    updateReferenceTemplate(
      id: number,
      input: ReferenceTemplateInput,
    ): ReferenceTemplate {
      const projectId = templateProjectId(db, id);
      checkProjectWritable(db, projectId);
      const values = checkedTemplate(db, projectId, input, id);
      const template = db
        .update(referenceTemplates)
        .set(values)
        .where(eq(referenceTemplates.id, id))
        .returning(templateColumns)
        .get();
      changes.publish({ type: 'project', id: projectId });
      return template;
    },

    /** Removes Reference template `id`, freeing its prefix. */
    removeReferenceTemplate(id: number) {
      const projectId = templateProjectId(db, id);
      checkProjectWritable(db, projectId);
      db.delete(referenceTemplates).where(eq(referenceTemplates.id, id)).run();
      changes.publish({ type: 'project', id: projectId });
    },
  };
}
