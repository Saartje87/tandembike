/** The Skills every Project starts with (T620). */
export const defaultSkills = [
  '/mattpocock-skills:grilling',
  '/mattpocock-skills:grill-with-docs',
  '/mattpocock-skills:retro',
  '/mattpocock-skills:to-spec',
  '/mattpocock-skills:to-tickets',
];

const maxSkills = 20;
const maxSkillLength = 100;

/**
 * `entries` as a Project's Skills: trimmed, blank ones dropped, each starting
 * with `/`. Returns why they cannot be, naming the first entry at fault.
 */
export function normalizeSkills(
  entries: string[],
): { skills: string[] } | { problem: string } {
  const skills = entries
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '')
    .map((entry) => (entry.startsWith('/') ? entry : `/${entry}`));
  if (skills.length > maxSkills) {
    return { problem: `Enter at most ${maxSkills} Skills.` };
  }
  const seen = new Set<string>();
  for (const skill of skills) {
    if (/\s/.test(skill)) {
      return {
        problem: `"${skill}" has a space. Enter one command per line.`,
      };
    }
    if (skill.length > maxSkillLength) {
      return {
        problem: `"${skill}" is longer than ${maxSkillLength} characters.`,
      };
    }
    if (seen.has(skill)) {
      return { problem: `"${skill}" is listed twice.` };
    }
    seen.add(skill);
  }
  return { skills };
}
