import type { SkillRegistration } from '@deepseek-ai/dsh-skill';
/** Skill directory bundle shipped by this package (relative to src/ or lib/). */
export declare const BUNDLED_SKILL_DIR = "../../skills/sidebar-controller";
/** URL of the bundled SKILL.md, anchored to THIS module — src/host/ and the
 *  built lib/host/ sit at the same depth, so one URL serves both. */
export declare const BUNDLED_SKILL_URL: URL;
/** Parsed result of a skill file's YAML frontmatter block. */
export interface ParsedSkillFrontmatter {
    name: string;
    description: string;
    whenToUse?: string;
    /** Markdown body after the closing `---` (leading blank line trimmed). */
    content: string;
}
/**
 * Parse the `---` frontmatter of a SKILL.md. Supports plain scalars and
 * folded `>` / literal `|` block scalars (`>-` / `|-` variants) for
 * description / whenToUse. Returns `undefined` for anything that is not a
 * valid skill file (no frontmatter, or missing name/description).
 */
export declare function parseSkillFrontmatter(raw: string): ParsedSkillFrontmatter | undefined;
/**
 * Load the bundled SKILL.md into a runtime skill registration.
 * @param fileUrl - override for the bundled file URL (used by tests);
 *   defaults to {@link BUNDLED_SKILL_URL}.
 * @returns the registration, or `undefined` when the file is missing,
 *   unreadable, or fails frontmatter validation.
 */
export declare function loadBundledSkill(fileUrl?: string | URL): Promise<SkillRegistration | undefined>;
