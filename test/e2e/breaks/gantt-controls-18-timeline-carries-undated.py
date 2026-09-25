# THE TIMELINE CARRIES EVERY TASK: the date filter is gone from the SQL, and no filter follows it.
# Expect: SHORT — measured on lane 1: the claim reddens (the undated task WAS carried), and the
# undated task then reaches the page, whose bars no longer narrow to one project, so the suite's
# own setup for the page sections throws (3 of 30). The page drawing only dated work is what the
# filter protects; the short run is the patch's doing, not a gap in the suite.
# Reddens: gantt-controls: "the timeline carries only the tasks it can draw: this run’s task with neither date is in neither read, and its dated ones are"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = "          or(isNotNull(tasks.startDate), isNotNull(tasks.dueDate)),\n          ...(opts.projectId ? [eq(lists.projectId, opts.projectId)] : []),\n"
b = "          ...(opts.projectId ? [eq(lists.projectId, opts.projectId)] : []),\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('gantt-controls-18-timeline-carries-undated: the timeline reads undated tasks')
