// The agents that have a logo of their own, split by how AgentIcon draws them. This file holds
// only ids, so code that just needs to know which logos exist (the Action icon picker, the
// persistence of an Action) does not load the images and inline marks of agentIcon.tsx. AgentIcon
// types its URL table and its mark table on these lists, so a logo added in one place and not
// the other does not compile.
export const IMAGE_LOGO_IDS = ["claude", "gemini", "omp", "agy", "grok", "openclaude"] as const;
export const INLINE_MARK_IDS = ["pi", "opencode", "codex", "goose", "aider", "cursor-agent"] as const;

export type ImageLogoId = (typeof IMAGE_LOGO_IDS)[number];
export type InlineMarkId = (typeof INLINE_MARK_IDS)[number];

/** Every agent id with a logo, the Kex mark included. */
export const AGENT_LOGO_IDS: readonly string[] = [...IMAGE_LOGO_IDS, ...INLINE_MARK_IDS, "kex"];
