# Files a real office suite wrote, for `importers.mjs`

The importers read files other programs write, so the suite reads files another
program wrote — LibreOffice 24.2, from the sources beside them:

- `monday.xlsx` is `monday.csv` saved as Excel 2007–365. The CSV is laid out as
  Monday's "Export board to Excel" is: the board's name on the first row, then
  each group — its name on a row of its own, the column names again, its items
  and a row of the group's sums.
- `wrike.xls` is `wrike.csv` saved as Excel 97–2003. It is laid out as Wrike's
  export is: one table, a task in two folders on two lines with one `Key`.
- `notes.docx` is `notes.html` saved by Writer as a Word document.

They were made with:

    soffice --headless --infilter='Text - txt - csv (StarCalc):44,34,76,1,,1033,false,true' --convert-to xlsx monday.csv
    soffice --headless --infilter='Text - txt - csv (StarCalc):44,34,76,1,,1033,false,true' --convert-to 'xls:MS Excel 97' wrike.csv
    soffice --headless --infilter='HTML (StarWriter)' --convert-to 'docx:MS Word 2007 XML' notes.html

The CSV filter's options turn on "Detect special numbers", so `2026-10-20` is
stored as a date and `2026-10-22 09:30` as a date with a time, as Excel stores
the dates a board exports. `Ana Importer` in the Person and Assigned To
columns is the member the suite makes in its own workspace, matched by name.
