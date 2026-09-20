/**
 * §15 — the AI authoring a skill for you, `[18:17]–[18:42]`.
 *
 *   "main is ko sab cheezein batati jaoongi… Pehle to woh apna [data sketch] out
 *    karega jo main kaam kar rahi hoon… phir woh meri poori ki poori SKILL
 *    create karega… main yahan pe likhoongi: 'create a personal task organizer
 *    skill', to yeh poori ki poori skill ban jayegi."
 *
 * The starter cards on the hub are what she calls EXAMPLES `[18:03]`. This is
 * the mechanism: you ask in words, it looks at what you actually do, and it
 * drafts the whole skill — then stops and asks before writing anything.
 *
 * Everything here is pure and DB-free, like `ai-command.ts` next door, so the
 * shape of a proposal can be tested without a live model. The two halves that
 * matter are both in this file: nothing is written until `approved` is true,
 * and a proposal that cannot be parsed becomes null rather than a half-skill.
 */
/** A step the server actually performed, reported while it works. */
export interface ProposalStep {
    /** Shown verbatim — "Mapping your task habits" (frame `t1138`). */
    label: string;
    /** What the lookup found, folded into the rationale. Never invented. */
    finding?: string;
}
export interface SkillProposal {
    name: string;
    description: string;
    instructions: string;
    /**
     * Things worth remembering about how this person works, written into the
     * skill's memory when the proposal is approved — [18:42] "yeh hum jo bhi baat
     * karenge woh STORE karega apne andar."
     */
    memories: string[];
    /**
     * Grounded in the steps, not generic. Her example, frame `t1146`: "I found a
     * mostly empty personal list, so I'd keep this simple and low-maintenance,
     * not build you a productivity spaceship."
     */
    rationale: string;
    /** What was actually looked at, in order. */
    steps: ProposalStep[];
    /** The chips under the answer — frames `t1122`, `t1146`. */
    followUps: string[];
}
/** The approval gate's wording, from frame `t1146`. */
export declare const APPROVAL_PROMPT = "Approve this approach and I'll create it, or tell me one tweak you want first.";
/**
 * Turn whatever the model returned into a proposal, or nothing.
 *
 * Deliberately strict about the two fields that make a skill a skill: a name
 * and instructions. A proposal missing either would create a skill that does
 * nothing, which is worse than saying it could not be drafted — and this is
 * the last checkpoint before a person is shown something to approve.
 */
export declare function parseSkillProposal(raw: unknown, steps?: ProposalStep[]): SkillProposal | null;
/**
 * What a person is shown before deciding, ending in her exact question.
 *
 * The rationale leads because that is what makes the proposal answerable: at
 * `[18:58]` the reason ("I found a mostly empty personal list") is what tells
 * her whether the design is right, not the list of capabilities.
 */
export declare function renderProposal(proposal: SkillProposal): string;
/**
 * The deterministic draft used when no model is configured.
 *
 * Not a placeholder: an instance without `ANTHROPIC_API_KEY` still gets a real,
 * usable skill from a real request, and the steps say plainly that it was
 * drafted from the request rather than from the workspace — so nobody is shown
 * grounding that did not happen.
 */
export declare function fallbackProposal(request: string, steps?: ProposalStep[]): SkillProposal;
/**
 * §15 — "Skills Miner / Turn repeat work into skills / Scan your tasks, docs,
 * and chats to surface workflows worth saving" (frame `285_1743`).
 *
 * A mined skill is a proposal like any other — nothing is written until it is
 * approved — but it carries the evidence that suggested it, because "we found a
 * pattern" is only worth reading if you can see the pattern.
 */
export interface MinedSkill extends SkillProposal {
    /** The actual titles/messages that suggested this. Never invented. */
    evidence: string[];
}
/**
 * Parse a mining run into proposals.
 *
 * Each one goes through `parseSkillProposal`, so a suggestion missing a name or
 * instructions is dropped rather than surfacing as an approvable card that
 * would create an empty skill. Returning fewer is the honest outcome; returning
 * a broken one is not.
 */
export declare function parseMinedSkills(raw: unknown, steps?: ProposalStep[]): MinedSkill[];
/**
 * What the miner says when it found nothing.
 *
 * Deliberately not an error and not an empty list with no explanation: a person
 * who clicks "Find my Skills" on a quiet workspace should be told that it read
 * their work and there was not enough repetition yet, which is a different
 * thing from the button being broken.
 */
export declare function noPatternsFound(scanned: ProposalStep[]): string;
