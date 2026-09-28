# One sentence under every model name. "A description is present" still passes; the
# card explains nothing, and two models are told apart only by their label. This is
# the missing-i18n-key defect in another shape — the fallback renders a sibling's
# string and every "it has a label" check goes green.
# Reddens: ai-model-cards: "carrying that model’s OWN one line, the same one the catalogue serves" / "saying something different about a different model"
import io
p = '/home/user/rundesk/apps/web/src/components/ai-panel.tsx'
a = """          <p data-testid={`ai-model-hint-${model.id}`} className="mt-0.5 text-[11px] text-muted-foreground">
            {model.hint}
          </p>"""
b = """          <p data-testid={`ai-model-hint-${model.id}`} className="mt-0.5 text-[11px] text-muted-foreground">
            Fast, capable model for everyday work
          </p>"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ai-panel.tsx: every hover card now says the same sentence.')
