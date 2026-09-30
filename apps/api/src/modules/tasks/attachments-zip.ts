/**
 * WHAT GOES INTO A TASK'S "DOWNLOAD ALL", AND WHAT IT IS CALLED
 * (`found-30-sep/attachments-have-no-download-all`).
 *
 * ClickUp: "Download all your task attachments into a zipped file for easy
 * sharing. To download all task attachments, click the download icon in the
 * upper-right corner of the Attachments section" (help centre, "Add
 * attachments to tasks", read through search excerpts). Its section lists a
 * comment's files too ("Attachments in comments are also displayed in the
 * attachments section"), so the zip holds every file the task's list holds,
 * comments' among them, in the list's order.
 *
 * LINKS ARE LISTED, NOT FETCHED. An attachment by link is an address somebody
 * typed; the product holds no bytes for it, and fetching whatever it names from
 * the API's own network, to put in a zip, would be a request forged on the
 * server's behalf and would bring back a web page or a sign-in more often than
 * a file. ClickUp's help does not say what its zip does with a file linked from
 * a cloud drive ("attach files from outside of ClickUp"). Left out, though, a
 * zip handed on "for easy sharing" would lose part of what the section shows,
 * with nothing to say so. So the links ride along in one text entry,
 * `links.txt`, after the files: each by its name, then its address.
 *
 * THE ZIP IS NAMED AFTER THE TASK. ClickUp's is always "clickup-attachments",
 * and its feedback board asks for the task's name instead: several downloads
 * arrive as "clickup-attachments.zip", "clickup-attachments(1).zip",
 * "clickup-attachments(2).zip" ("Download All Attachments: .Zip File Name
 * Should = Task Name"). So `<title>-attachments.zip`, made safe.
 *
 * Pure, and unit-tested in tasks-attachments-zip.test.ts.
 */
import { safeEntryName } from '../../common/export/zip-names'
import type { ZipMethod } from '../../common/export/zip-stream'
import { isLinkAttachmentKey } from './task-object-keys'

/**
 * The most a task's files may come to in one zip: 1 GiB. Ten files at the
 * 100 MB an attachment may be (`MAX_ATTACHMENT_BYTES`), and well inside the
 * 4 GiB an archive without Zip64 can address (`zip-stream.ts`). Past it the
 * route refuses before a byte is sent, and each file is still one Download away.
 */
export const ATTACHMENTS_ZIP_MAX_BYTES = 1024 * 1024 * 1024

/** The text entry a task's links are listed in, after its files. */
export const LINKS_ENTRY_NAME = 'links.txt'

/** A row of `task_attachments`, as the zip reads it. */
export type ZipAttachmentRow = {
  id: string
  fileName: string
  contentType: string
  storageKey: string
  createdAt: Date
}

/**
 * Of the task's rows, in the list's order: the files, which go in as
 * themselves, and the links, which are listed. A row with no key yet is a file
 * still arriving, which has no Download link either, and is neither.
 */
export function zipContents<T extends { storageKey: string }>(rows: readonly T[]): { files: T[]; links: T[] } {
  const files = rows.filter((r) => !!r.storageKey && !isLinkAttachmentKey(r.storageKey))
  const links = rows.filter((r) => isLinkAttachmentKey(r.storageKey))
  return { files, links }
}

/** One line of text: a newline or a control character in a name would start another entry of the list. */
// eslint-disable-next-line no-control-regex
const oneLine = (value: string) => value.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim()

/** `links.txt`: each link by its name, then its address, a blank line between them, in the list's order. */
export function linksText(links: readonly { fileName: string; storageKey: string }[]): string {
  return links.map((link) => `${oneLine(link.fileName)}\n${oneLine(link.storageKey)}\n`).join('\n')
}

/**
 * Whether an entry is worth deflating, by the type it was uploaded as. A
 * photo, a PDF, a video or an archive is compressed already; text is not.
 */
export function zipMethodFor(contentType: string | null | undefined): ZipMethod {
  const type = (contentType ?? '').toLowerCase()
  return /^text\//.test(type) || /(json|xml|javascript|ecmascript|csv|yaml|svg|x-sh|rtf)/.test(type) ? 'deflate' : 'store'
}

/**
 * `fn` over every item, `limit` at a time, answers in the items' order: each
 * file is sized by a request to the store, and a task of a thousand files would
 * otherwise send a thousand at once.
 */
export async function mapAtMost<T, R>(limit: number, items: readonly T[], fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next
      next += 1
      out[i] = await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

/** RFC 5987: the name in UTF-8, percent-encoded, for `filename*`. */
function encodeExtValue(value: string): string {
  return encodeURIComponent(value).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
}

/**
 * The zip's name, `<title>-attachments.zip`, made safe as an entry's name is
 * (`safeEntryName`), and the `Content-Disposition` that carries it: an ASCII
 * `filename` for any client, and the whole name in `filename*` (RFC 6266), so a
 * title in Arabic or Urdu is not saved as `task-attachments.zip`.
 */
export function attachmentsZipName(title: unknown): { fileName: string; disposition: string } {
  const base = safeEntryName(title, 'task')
  const fileName = `${base}-attachments.zip`
  const asciiBase =
    base
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^\x20-\x7e]/g, '')
      .replace(/[%;]/g, '_')
      .trim() || 'task'
  return {
    fileName,
    disposition: `attachment; filename="${asciiBase}-attachments.zip"; filename*=UTF-8''${encodeExtValue(fileName)}`,
  }
}
