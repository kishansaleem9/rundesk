# Pressing a starter card asks the assistant its own LABEL — "Project Status" — rather
# than the question the card is offering to ask. The card lights up, a turn happens,
# and the answer is to a two-word prompt nobody wrote.
# Reddens: ai-answer-rendering: "pressing a card asks its prompt, which is a sentence and not the card's label"
import io
p = '/home/user/rundesk/apps/web/src/components/ai-panel.tsx'
a = "                    onClick={() => sendMessage(t(card.promptKey as TranslationKey))}"
b = "                    onClick={() => sendMessage(t(card.titleKey as TranslationKey))}"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ai-panel.tsx: a starter card now sends its title instead of its prompt.')
