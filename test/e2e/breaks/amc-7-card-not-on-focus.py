# Mouse-only. The measurement the card exists to show becomes something a keyboard
# user never sees, and tabbing down the list walks past three silent rows.
# Reddens: ai-model-cards: "focusing a row with the keyboard opens its card too"
import io
p = '/home/user/rundesk/apps/web/src/components/ai-panel.tsx'
a = """        onFocus={() => onHover(model.id)}
        onBlur={() => onHover(null)}
"""
b = ""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ai-panel.tsx: the hover card no longer opens on focus.')
