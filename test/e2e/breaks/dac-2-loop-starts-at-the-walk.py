# A PARENT LOOP TAKEN FROM WHEREVER THE WALK STARTED, as the first draft did: which doc of the loop
# was listed first decided whether the others were hidden.
# Reddens: unit: doc-access.test.ts "ends at a parent loop in the data instead of hanging, and still decides every doc on it"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/doc-access.ts'
a = "      if (at !== undefined) {\n        // A LOOP: every doc on it is above every other, so they share one\n        // answer. Taking the walk's starting point as the top instead made\n        // the answer depend on which doc of the loop was listed first.\n        const loop = path.slice(at)\n        tail = loop.reduce((acc, loopId) => join(acc, own(byId.get(loopId)!)), tail)\n        for (const loopId of loop) memo.set(loopId, tail)\n        path.length = at\n        break\n      }\n"
b = '      if (at !== undefined) break\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("dac-2-loop-starts-at-the-walk: applied")
