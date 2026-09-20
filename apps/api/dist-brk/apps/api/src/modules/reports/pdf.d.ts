/**
 * Render a title + list of text lines to a paginated PDF Buffer.
 * `lines` should already be column-joined (e.g. via padded columns).
 */
export declare function renderReportPdf(title: string, lines: string[]): Buffer;
/** Format a header row + data rows into fixed-width columns for the PDF body. */
export declare function tableToLines(header: string[], rows: Array<Array<string | number>>): string[];
