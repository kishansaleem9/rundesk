# Hovering any row opens EVERY card. Three overlapping panels, and the one under the
# cursor is whichever happens to be painted last.
# Reddens: ai-model-cards: "exactly one card is up" / "and closes the first — one card at a time"
import io
p = '/home/user/rundesk/apps/web/src/components/ai-panel.tsx'
# Anchored on the whole prop block, because the `hovered=` line alone also appears
# (more deeply indented) in the disclosure's copy of the row — and a two-match anchor
# is a patch that touches twice as much as it claims to.
a = """                    preferred={preferredTier === m.id}
                    hovered={hoveredModel === m.id}
                    onHover={setHoveredModel}"""
b = """                    preferred={preferredTier === m.id}
                    hovered={hoveredModel !== null}
                    onHover={setHoveredModel}"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ai-panel.tsx: hovering one row opens all three cards.')
