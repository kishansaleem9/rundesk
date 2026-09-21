# The hover card is rendered ALWAYS and merely styled away — the shape a "hover card"
# takes when hover was never wired. It photographs correctly and a visibility check on
# a build where hovering does nothing at all would still pass.
# Reddens: ai-model-cards: "with no hover card anywhere before anything is hovered"
import io
p = '/home/user/rundesk/apps/web/src/components/ai-panel.tsx'
a = """      {hovered && (
        <div
          data-testid={`ai-model-card-${model.id}`}
          role="tooltip"
          className="pointer-events-none absolute left-full top-0 z-[70] ml-2 w-56 rounded-lg border border-border bg-popover p-3 shadow-xl"
        >"""
b = """      {true && (
        <div
          data-testid={`ai-model-card-${model.id}`}
          role="tooltip"
          className={`pointer-events-none absolute left-full top-0 z-[70] ml-2 w-56 rounded-lg border border-border bg-popover p-3 shadow-xl ${hovered ? '' : 'opacity-0'}`}
        >"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ai-panel.tsx: every model card is in the DOM from the start, hidden with CSS.')
