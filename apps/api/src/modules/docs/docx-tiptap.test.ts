import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { zipOf } from '../../common/import/zip-test-kit'
import { docxToDoc, DocxReadError } from './docx-tiptap'
import { tiptapToMarkdown } from './tiptap-markdown'

/**
 * A WORD DOCUMENT AS A DOC (`commit-log/log-601eacc-2`): the parts Word
 * writes, put together here, read into the blocks a Doc holds.
 */
const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
const p = (inner: string, props = '') => `<w:p>${props ? `<w:pPr>${props}</w:pPr>` : ''}${inner}</w:p>`
const r = (text: string, props = '') => `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ''}<w:t xml:space="preserve">${text}</w:t></w:r>`
const style = (id: string) => `<w:pStyle w:val="${id}"/>`
const num = (numId: number, level: number) => `<w:numPr><w:ilvl w:val="${level}"/><w:numId w:val="${numId}"/></w:numPr>`

const STYLES =
  `<w:styles ${W}>` +
  '<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/></w:style>' +
  '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style>' +
  '<w:style w:type="paragraph" w:styleId="berschrift2"><w:name w:val="heading 2"/></w:style>' +
  '<w:style w:type="paragraph" w:styleId="Custom3"><w:name w:val="My section"/><w:pPr><w:outlineLvl w:val="2"/></w:pPr></w:style>' +
  '</w:styles>'

// numId 1: bullets at every level; numId 2: decimal at level 0.
const NUMBERING =
  `<w:numbering ${W}>` +
  '<w:abstractNum w:abstractNumId="10"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/></w:lvl><w:lvl w:ilvl="1"><w:numFmt w:val="bullet"/></w:lvl></w:abstractNum>' +
  '<w:abstractNum w:abstractNumId="20"><w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/></w:lvl></w:abstractNum>' +
  '<w:num w:numId="1"><w:abstractNumId w:val="10"/></w:num>' +
  '<w:num w:numId="2"><w:abstractNumId w:val="20"/></w:num>' +
  '</w:numbering>'

const RELS =
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rIdLink" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.com/spec" TargetMode="External"/>' +
  '</Relationships>'

const core = (title: string) =>
  `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${title}</dc:title></cp:coreProperties>`

async function docx(body: string, opts: { title?: string } = {}) {
  return zipOf({
    '[Content_Types].xml': '<Types/>',
    'word/document.xml': `<w:document ${W}><w:body>${body}<w:sectPr/></w:body></w:document>`,
    'word/styles.xml': STYLES,
    'word/numbering.xml': NUMBERING,
    'word/_rels/document.xml.rels': RELS,
    ...(opts.title !== undefined ? { 'docProps/core.xml': core(opts.title) } : {}),
  })
}

describe('docxToDoc — a Word document as a Doc', () => {
  it('takes a Title paragraph at the top as the title, and reads headings by style name and outline level', async () => {
    const doc = docxToDoc(
      await docx(
        p(r('Quarterly plan'), style('Title')) +
          p(r('Goals'), style('Heading1')) +
          p(r('Hiring'), style('berschrift2')) +
          p(r('Budget'), style('Custom3')) +
          p(r('Plain words.')),
      ),
      'plan.docx',
    )
    assert.equal(doc.title, 'Quarterly plan')
    assert.equal(tiptapToMarkdown(doc.content).trim(), '# Goals\n\n## Hiring\n\n### Budget\n\nPlain words.')
  })

  it('reads bold, italic and strike runs, a link by its relationship and by a HYPERLINK field, a tab and a line break', async () => {
    const field =
      '<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> HYPERLINK "https://example.com/field" </w:instrText></w:r>' +
      '<w:r><w:fldChar w:fldCharType="separate"/></w:r>' + r('field link') + '<w:r><w:fldChar w:fldCharType="end"/></w:r>'
    const doc = docxToDoc(
      await docx(
        p(r('Bold', '<w:b/>') + r(' and ') + r('italic', '<w:i/>') + r(' and ') + r('not bold', '<w:b w:val="0"/>') + r(' and ') + r('gone', '<w:strike/>')) +
          p(`<w:hyperlink r:id="rIdLink">${r('the spec')}</w:hyperlink> and ${''}` + field) +
          p(`${r('a')}<w:r><w:tab/></w:r>${r('b')}<w:r><w:br/></w:r>${r('c')}`),
      ),
    )
    assert.equal(
      tiptapToMarkdown(doc.content).trim(),
      '**Bold** and *italic* and not bold and ~~gone~~\n\n[the spec](https://example.com/spec)[field link](https://example.com/field)\n\na\tb\nc',
    )
  })

  it('gathers numbered and bulleted paragraphs into lists, nested by their level', async () => {
    const doc = docxToDoc(
      await docx(
        p(r('First bullet'), num(1, 0)) +
          p(r('Nested bullet'), num(1, 1)) +
          p(r('Second bullet'), num(1, 0)) +
          p(r('Between')) +
          p(r('Step one'), num(2, 0)) +
          p(r('Step two'), num(2, 0)),
      ),
    )
    assert.equal(tiptapToMarkdown(doc.content).trim(), '- First bullet\n  - Nested bullet\n- Second bullet\n\nBetween\n\n1. Step one\n2. Step two')
  })

  it('reads a table, a row Word repeats as a header being the header row; a table inside a cell is its paragraphs', async () => {
    const tc = (inner: string) => `<w:tc><w:tcPr/>${inner}</w:tc>`
    const table =
      '<w:tbl><w:tblPr/>' +
      `<w:tr><w:trPr><w:tblHeader/></w:trPr>${tc(p(r('Name')))}${tc(p(r('Owner')))}</w:tr>` +
      `<w:tr>${tc(p(r('Alpha')))}${tc(`<w:tbl><w:tr>${tc(p(r('Ana')))}</w:tr></w:tbl>` + p(r('and Ben')))}</w:tr>` +
      '</w:tbl>'
    const doc = docxToDoc(await docx(table))
    assert.equal(tiptapToMarkdown(doc.content).trim(), '| Name | Owner |\n| --- | --- |\n| Alpha | Ana and Ben |')
  })

  it('leaves out a deleted revision, keeps an inserted one, and says where a picture stood', async () => {
    const doc = docxToDoc(
      await docx(p(`${r('Kept ')}<w:del><w:r><w:delText>removed </w:delText></w:r></w:del><w:ins>${r('added ')}</w:ins><w:r><w:drawing/></w:r>`)),
    )
    assert.equal(tiptapToMarkdown(doc.content).trim(), 'Kept added [Image]')
  })

  it('takes the title from the document’s properties, and from the file’s name when there is none', async () => {
    assert.equal(docxToDoc(await docx(p(r('Body')), { title: 'From properties' }), 'x.docx').title, 'From properties')
    assert.equal(docxToDoc(await docx(p(r('Body'))), 'Minutes 12 Oct.docx').title, 'Minutes 12 Oct')
  })

  it('refuses a zip that is no Word document, and a file that is no zip, in words', async () => {
    await assert.rejects(async () => docxToDoc(await zipOf({ 'xl/workbook.xml': '<workbook/>' })), /not a Word document/)
    assert.throws(() => docxToDoc(Buffer.from('plain text')), DocxReadError)
  })
})
