"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SKILL_ARCHETYPES = exports.SKILL_TEMPLATES = void 0;
exports.skillTemplate = skillTemplate;
exports.SKILL_TEMPLATES = [
    {
        archetype: 'scratch',
        title: 'Start from scratch',
        description: 'Package your expertise into a reusable skill',
        instructions: '',
        tone: 'neutral',
    },
    {
        archetype: 'delegate_like_me',
        title: 'Delegate Like Me',
        description: 'Assigns and hands off work the way you would',
        instructions: [
            'You hand work off the way I do.',
            '',
            'When asked to delegate something, name who should own it and why, say what',
            '"done" looks like, and give the context they need to start without asking me',
            'a follow-up question. Prefer the person closest to the work over the person',
            'with the most spare capacity. Flag it when neither is a good fit rather than',
            'assigning anyway.',
        ].join('\n'),
        tone: 'coral',
    },
    {
        archetype: 'brand_voice',
        title: 'Brand Voice',
        description: 'Interviews you on tone, terminology, and audience for your brand',
        instructions: [
            'You write in our voice.',
            '',
            'Before writing anything substantial, ask me about the audience, the tone, and',
            'any terms we do or do not use — one question at a time, and only what you',
            "actually need. Remember the answers; do not ask twice. When you draft, match",
            'what you have been told rather than defaulting to neutral marketing English.',
        ].join('\n'),
        tone: 'green',
    },
    {
        archetype: 'triage_like_me',
        // The frame clipped this mid-sentence; the ellipsis marks the unread span.
        title: 'Triage Tasks Like Me',
        description: 'Prioritizes and sorts incoming work the way you usually would',
        instructions: [
            'You triage incoming work the way I do.',
            '',
            'Sort by what is genuinely blocking someone else first, then by deadline, then',
            'by effort. Say which of those decided each call. When something looks urgent',
            'but is not, say so plainly instead of ranking it high to be safe.',
        ].join('\n'),
        tone: 'blue',
    },
];
exports.SKILL_ARCHETYPES = exports.SKILL_TEMPLATES.map((t) => t.archetype);
function skillTemplate(archetype) {
    return exports.SKILL_TEMPLATES.find((t) => t.archetype === archetype);
}
//# sourceMappingURL=skill-templates.js.map