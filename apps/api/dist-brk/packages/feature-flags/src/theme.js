"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ACCENT_HEX = exports.ACCENT_PALETTE = void 0;
/**
 * §G06 [07:11], frame 113_0716 — the accent palette a person picks for
 * themselves.
 *
 * Her frame shows ClickUp's Themes tab as a row of *named* colours, and that
 * shape matters beyond fidelity: an arbitrary hex can come out unreadable
 * against light or dark, and a fixed set is the only version of this the server
 * can validate and a check can assert.
 *
 * This lives in the shared package rather than in the API or the web app
 * because both need the same list — the server to reject anything else, the
 * client to render the swatches. A palette restated in two places is a palette
 * that drifts, which is the defect this audit has already fixed twice (the
 * help library's topics, the command palette's filter list). The package is
 * named for feature flags; it is in practice the only module both sides
 * import, and one honest home beats two that disagree.
 *
 * Values are chosen to hold contrast in both themes; `null` anywhere means
 * "no personal choice", which falls back to the workspace's accent.
 */
exports.ACCENT_PALETTE = [
    'black',
    'purple',
    'blue',
    'pink',
    'violet',
    'indigo',
    'orange',
    'teal',
    'bronze',
    'mint',
];
/** The hex each named accent resolves to. */
exports.ACCENT_HEX = {
    black: '#3b3b45',
    purple: '#7b68ee',
    blue: '#3b82f6',
    pink: '#ec4899',
    violet: '#8b5cf6',
    indigo: '#6366f1',
    orange: '#f97316',
    teal: '#14b8a6',
    bronze: '#b45309',
    mint: '#10b981',
};
//# sourceMappingURL=theme.js.map