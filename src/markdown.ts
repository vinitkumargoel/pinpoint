import { marked } from "marked";

/**
 * Render a Markdown source string into a complete, styled HTML document.
 *
 * The output is what the annotator's iframe loads when the file under review is
 * Markdown: clean semantic tags (h1/p/ul/li/blockquote/pre/table…) that the
 * element-anchored annotator can target, wrapped in `<main class="markdown-body">`
 * so generated CSS selectors stay stable and readable.
 */
export function renderMarkdown(md: string, title: string): string {
  const body = marked.parse(md, { gfm: true, breaks: false }) as string;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>${PAGE_CSS}</style>
</head>
<body>
<main class="markdown-body">
${body}
</main>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
}

/** GitHub-flavoured, readable document styling. Self-contained (no web fonts). */
const PAGE_CSS = `
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: #ffffff;
    color: #1f2328;
    font: 16px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif;
  }
  .markdown-body {
    max-width: 820px;
    margin: 0 auto;
    padding: 48px 44px 96px;
  }
  .markdown-body > *:first-child { margin-top: 0; }
  h1, h2, h3, h4, h5, h6 { margin: 1.6em 0 0.6em; font-weight: 600; line-height: 1.25; }
  h1 { font-size: 2em; padding-bottom: .3em; border-bottom: 1px solid #d1d9e0; }
  h2 { font-size: 1.5em; padding-bottom: .3em; border-bottom: 1px solid #d1d9e0; }
  h3 { font-size: 1.25em; }
  h4 { font-size: 1em; }
  h5 { font-size: .875em; }
  h6 { font-size: .85em; color: #59636e; }
  p, ul, ol, blockquote, table, pre { margin: 0 0 1em; }
  ul, ol { padding-left: 2em; }
  li + li { margin-top: .25em; }
  li > ul, li > ol { margin: .25em 0 0; }
  a { color: #0969da; text-decoration: none; }
  a:hover { text-decoration: underline; }
  strong { font-weight: 600; }
  blockquote {
    margin-left: 0; padding: 0 1em;
    color: #59636e; border-left: .25em solid #d1d9e0;
  }
  code {
    font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
    font-size: .875em;
    background: rgba(129,139,152,0.12);
    padding: .2em .4em; border-radius: 6px;
  }
  pre {
    background: #f6f8fa; border-radius: 8px; padding: 14px 16px; overflow: auto;
  }
  pre code { background: none; padding: 0; font-size: .85em; }
  hr { height: 1px; border: 0; background: #d1d9e0; margin: 2em 0; }
  img { max-width: 100%; }
  table { border-collapse: collapse; display: block; overflow: auto; width: max-content; max-width: 100%; }
  th, td { border: 1px solid #d1d9e0; padding: 6px 13px; }
  tr:nth-child(2n) { background: #f6f8fa; }
  table th { font-weight: 600; }
`;
