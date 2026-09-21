# The tab strip goes back to its own hand-kept copy of the list — the
# duplicated-list defect, reintroduced, and already drifted by one entry.
import io
p='/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'
s=io.open(p,encoding='utf-8').read()
a="          {CREATE_TYPES.map((tab) => ("
assert s.count(a)==1
b="          {CREATE_TYPES.filter((tb) => tb.value !== 'folder').map((tab) => ("
io.open(p,'w',encoding='utf-8').write(s.replace(a,b))
