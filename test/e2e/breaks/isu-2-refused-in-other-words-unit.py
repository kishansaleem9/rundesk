# A FILE THAT IS NOT DELIMITED TEXT IS REFUSED IN WORDS THE PAGE DOES NOT USE (`found-5-oct/xlsx-read-as-text`).
# RE-AIMED (batch 38, `ledger-rows/row-816`): the refusal now says to send the file itself, as
# the page does, and names the six kinds the import reads.
# Reddens: unit: spreadsheet-import.util.test.ts "is refused in words that say to send the file itself, and what the page reads"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/spreadsheet-import.util.ts'
s = io.open(p, encoding='utf-8').read()
a = "upload the file itself and send its key, as the import page does. ${NOT_A_SHEET_FILE}`"
b = "only delimited text is read.`"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("isu-2-refused-in-other-words-unit: the refusal says other words")
