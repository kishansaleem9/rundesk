# The upload commits the storage key it was ABOUT to write, before knowing
# whether the PUT worked — so a refused upload still moves the task's cover to a
# key with nothing behind it, and the banner draws a broken image.
#
# `commit` is moved above the PUT rather than the check being deleted, because
# that is the shape this mistake really takes: optimism about a request that has
# not answered yet.
#
# PREDICTED ONE. The refusal is still reported, so the check above it passes.
#
# Reddens: task-cover: "and the cover is left exactly as it was"
import io
p = '/home/user/rundesk/apps/web/src/components/cover-image-picker.tsx'
a = """      const put = await fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'content-type': file.type } })
      if (!put.ok) throw new Error(`upload failed: ${put.status}`)
      commit({ kind: 'stored', storageKey })
"""
b = """      commit({ kind: 'stored', storageKey })
      const put = await fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'content-type': file.type } })
      if (!put.ok) throw new Error(`upload failed: ${put.status}`)
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor occurs {s.count(a)} times, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('cover-image-picker.tsx: the cover is committed before the upload is known to have worked.')
