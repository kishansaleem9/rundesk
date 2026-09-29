# A column that cannot be read fails the whole schedule, as the grid would if the
# service stopped catching per person: one stranger in the ask blanks every
# column instead of saying why in its own (`commit-log/log-1e7f092-1`).
#
# Reddens: team-schedules-api: "someone outside the workspace is refused in their own column, with a reason, while Sara’s column still draws"
import io
p = '/home/user/rundesk/apps/api/src/modules/planner/planner.service.ts'
a = '        } catch (err: any) {\n          /*\n           * A column that could not be read says so and the rest still draw.\n'
b = '        } catch (err: any) {\n          if (err) throw err\n          /*\n           * A column that could not be read says so and the rest still draw.\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('planner.service.ts: one refused column fails the schedule.')
