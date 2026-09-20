"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractMentionUserIds = extractMentionUserIds;
exports.formatMentionsInText = formatMentionsInText;
const MENTION_UUID_IN_ANGLE = /<@([0-9a-fA-F-]{36})>/g;
const MENTION_UUID_IN_BRACKET = /@\[([0-9a-fA-F-]{36})\]/g;
const MENTION_MARKDOWN = /@\[[^\]]+\]\(user:([0-9a-fA-F-]{36})\)/gi;
function extractMentionUserIds(text) {
    if (!text)
        return [];
    const ids = new Set();
    for (const pattern of [MENTION_UUID_IN_ANGLE, MENTION_UUID_IN_BRACKET, MENTION_MARKDOWN]) {
        const re = new RegExp(pattern.source, pattern.flags);
        let match;
        while ((match = re.exec(text)) !== null) {
            const id = match[1];
            if (id)
                ids.add(id);
        }
    }
    return [...ids];
}
function formatMentionsInText(text, namesById, fallback = 'teammate') {
    if (!text)
        return text;
    let next = text;
    next = next.replace(MENTION_MARKDOWN, (_, id) => `@${namesById[id] ?? fallback}`);
    next = next.replace(MENTION_UUID_IN_BRACKET, (_, id) => `@${namesById[id] ?? fallback}`);
    next = next.replace(MENTION_UUID_IN_ANGLE, (_, id) => `@${namesById[id] ?? fallback}`);
    return next;
}
//# sourceMappingURL=mentions.js.map