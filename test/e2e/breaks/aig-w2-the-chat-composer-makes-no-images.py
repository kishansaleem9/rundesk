# THE CHAT COMPOSER’S AI OFFERS NO IMAGES.
# (`ledger-rows/row-870`)
# Reddens: ai-image-generation: "the chat composer’s AI makes a picture too: added, it is attached to the message, and sent with it"
#   or "each ask is one run of `image.generate`, and the AI value report counts it under Images generated, a tile it now fills"
#
# Re-aimed 8 October: the last 1 of these are knock-ons of the same edit, measured on lane 9 — checks that stand on what the first ones lost.
import io
p = '/home/user/rundesk/apps/web/src/components/chat/chat-composer.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('              {onFilesSelected && workspaceId && (\n                <div className="border-t border-border/60 pt-2" data-testid="chat-ai-image">\n',
     '              {onFilesSelected && workspaceId && workspaceId.length < 0 && (\n                <div className="border-t border-border/60 pt-2" data-testid="chat-ai-image">\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('aig-w2-the-chat-composer-makes-no-images: the chat composer makes no images')
