import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { attr, decodeXmlEntities, localName, xmlTokens } from './xml-scan'

describe('xmlTokens — an XML part read as its tags and text, in order', () => {
  it('yields start tags with their attributes, end tags, self-closing tags and text', () => {
    const tokens = [...xmlTokens('<?xml version="1.0"?><w:p w:rsid="0A"><w:r><w:t xml:space="preserve"> a &amp; b </w:t></w:r><w:br/></w:p>')]
    assert.deepEqual(tokens, [
      { kind: 'open', name: 'w:p', attrs: { 'w:rsid': '0A' }, selfClosing: false },
      { kind: 'open', name: 'w:r', attrs: {}, selfClosing: false },
      { kind: 'open', name: 'w:t', attrs: { 'xml:space': 'preserve' }, selfClosing: false },
      { kind: 'text', text: ' a & b ' },
      { kind: 'close', name: 'w:t' },
      { kind: 'close', name: 'w:r' },
      { kind: 'open', name: 'w:br', attrs: {}, selfClosing: true },
      { kind: 'close', name: 'w:p' },
    ])
  })

  it('reads an attribute value holding ">" and single quotes, and CDATA as its text', () => {
    const tokens = [...xmlTokens(`<f formula='a>b' x="it's"><![CDATA[<raw> & text]]></f>`)]
    assert.deepEqual(tokens[0], { kind: 'open', name: 'f', attrs: { formula: 'a>b', x: "it's" }, selfClosing: false })
    assert.deepEqual(tokens[1], { kind: 'text', text: '<raw> & text' })
  })

  it('skips comments, processing instructions and a DOCTYPE, whose entities are never expanded', () => {
    const xml = '<!DOCTYPE x [<!ENTITY lol "lololol"><!ENTITY xxe SYSTEM "file:///etc/passwd">]><!-- note --><x>&lol;&xxe;</x>'
    const text = [...xmlTokens(xml)].filter((t) => t.kind === 'text').map((t) => (t as { text: string }).text).join('')
    assert.equal(text, '&lol;&xxe;')
  })
})

describe('decodeXmlEntities, localName and attr', () => {
  it('decodes the five XML entities and character references, and keeps anything else as written', () => {
    assert.equal(decodeXmlEntities('&lt;a&gt; &quot;b&quot; &apos;c&apos; &#169; &#x2713; &bogus;'), '<a> "b" \'c\' © ✓ &bogus;')
    assert.equal(decodeXmlEntities('&#0; &#xD800;'), '� �')
  })

  it('names an element or attribute by its local name, whatever prefix bound its namespace', () => {
    assert.equal(localName('w:p'), 'p')
    assert.equal(localName('row'), 'row')
    assert.equal(attr({ 'r:id': 'rId3' }, 'id'), 'rId3')
    assert.equal(attr({ id: 'plain' }, 'id'), 'plain')
    assert.equal(attr({}, 'id'), undefined)
  })
})
