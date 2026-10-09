# A LIBRARY THAT FAILS ANSWERS AN EMPTY PAGE, as if it held no photos.
# (`commit-log/log-601eacc-1`, `ledger-rows/row-739`)
# Reddens: cover-photo-search: "a library that fails is said to have not answered, and its rate limit as too many searches — never an empty grid"
import io
p = '/home/user/rundesk/apps/api/src/modules/cover-photos/cover-photos.controller.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('      return await searchPhotos(cfg, query, n)\n    } catch (err) {\n      throw libraryRefusal(err)\n',
     '      return await searchPhotos(cfg, query, n)\n    } catch (err) {\n      void err\n      return { photos: [], page: n, totalPages: 0, total: 0 } // BROKEN: a failure is no photos\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cph-4-a-failure-is-an-empty-page: a failure is an empty page')
