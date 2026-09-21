# Both meters drawn from the SAME score. Two bars at one length, one of them labelled
# Intelligence: a decoration with two captions, and nothing on screen looks wrong.
# Reddens: ai-model-cards: "its Speed and Intelligence are visibly DIFFERENT lengths"
#          ai-model-picker: "the Max tier's Intelligence bar is visibly longer than the Fast tier's"
import io
p = '/home/user/rundesk/apps/web/src/components/ai-panel.tsx'
a = """                ['speed', model.speed, t('aiModels.speed')],
                ['intelligence', model.intelligence, t('aiModels.intelligence')],"""
b = """                ['speed', model.speed, t('aiModels.speed')],
                ['intelligence', model.speed, t('aiModels.intelligence')],"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ai-panel.tsx: Intelligence is now drawn from the speed score, so both bars match.')
