/**
 * §15 — the prebuilt starter cards on her carousel (frame `285_1743`).
 *
 * Titles and descriptions are transcribed from the frames rather than
 * paraphrased, because the naming is the point: at [19:12] she stops to insist
 * that what you add is a SKILL, not a feature. "Triage Tasks Like Me" was
 * clipped at the viewport edge on every frame ("Prioritizes and sorts
 * incoming… you usually would"); the middle is reconstructed and marked below
 * so nobody later mistakes a guess for a transcription.
 *
 * The catalogue lives on the server so the copy has exactly one home: the same
 * constant validates `archetype` on create, seeds the new skill's instructions,
 * and is served to the hub for rendering. A second copy in the web bundle would
 * be a second thing to keep in step, and it would not stay in step.
 */
export interface SkillTemplate {
    archetype: 'scratch' | 'delegate_like_me' | 'brand_voice' | 'triage_like_me';
    title: string;
    description: string;
    /** Seeds the new skill's playbook body; the author edits from there. */
    instructions: string;
    /** Card tint on the hub — 'neutral' for the functional cards, else a gradient. */
    tone: 'neutral' | 'coral' | 'green' | 'blue';
}
export declare const SKILL_TEMPLATES: readonly SkillTemplate[];
export declare const SKILL_ARCHETYPES: ("scratch" | "delegate_like_me" | "brand_voice" | "triage_like_me")[];
export declare function skillTemplate(archetype: string): SkillTemplate | undefined;
