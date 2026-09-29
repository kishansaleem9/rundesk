# BRAIN² OPENS THE DOCK AND FORGETS WHICH TASK IT WAS OPENED FROM.
#
# The shape the header comment warned about before the button existed: a
# control that "could open the dock and not point it at the task". The shell
# opens the dock and drops the task on the floor, so the dock is about the
# list behind the sheet — and, not pointed at anything, it is not lifted over
# the sheet either, so it opens underneath it.
#
# Reddens: brain-entry-points: "and the dock is pointed at this task: the chip over its composer names the task and carries its id"
import io
p = '/home/user/rundesk/apps/web/src/routes/app.tsx'
a = """  const openAiOn = useCallback((scope: AiDockScope) => {
    setAiScope(scope)
    setAiOpen(true)
  }, [])
"""
b = """  const openAiOn = useCallback((scope: AiDockScope) => {
    void scope
    setAiOpen(true)
  }, [])
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('routes/app.tsx: Brain² opens the dock without pointing it at the task.')
