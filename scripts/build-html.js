/**
 * build-html.js
 * Converts every .md file in content/ to a self-contained HTML file in html/.
 * The output filename matches the markdown filename (e.g. home.md → html/home.html).
 *
 * Usage: node scripts/build-html.js
 *        npm run build:html
 */

'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const MarkdownIt = require('markdown-it');

const rootDir = path.resolve(__dirname, '..');
const contentDir = path.join(rootDir, 'content');
const outputDir = path.join(rootDir, 'html');

const md = new MarkdownIt({ html: false, linkify: true, typographer: true });

// ---------------------------------------------------------------------------
// Frontmatter helpers (mirrors build-content-index.js)
// ---------------------------------------------------------------------------
function parseFrontmatter(markdownText) {
    const match = String(markdownText || '').match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
    if (!match) {
        return { metadata: {}, content: markdownText };
    }

    const rawMeta = match[1].trim();
    const content = markdownText.slice(match[0].length);
    const metadata = {};

    for (const line of rawMeta.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        const separator = trimmed.indexOf(':');
        if (separator === -1) continue;

        const key = trimmed.slice(0, separator).trim().toLowerCase();
        const value = trimmed.slice(separator + 1).trim();
        if (key) metadata[key] = value;
    }

    return { metadata, content };
}

function parseTags(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value.map((t) => String(t).trim()).filter(Boolean);
    return String(value).split(',').map((t) => t.trim()).filter(Boolean);
}

function escapeHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ---------------------------------------------------------------------------
// HTML template
// ---------------------------------------------------------------------------
function buildPage({ title, category, author, date, tags, imgUrl, summary, bodyHtml, sourceFile }) {
    const tagItems = tags.length
        ? tags.map((t) => `<a href="../index.html#tag/${encodeURIComponent(t)}" class="tag-pill">${escapeHtml(t)}</a>`).join(', ')
        : '';

    const metaRows = [
        category && `<span class="badge badge--category">${escapeHtml(category)}</span>`,
        date && `<span class="badge badge--date">${escapeHtml(date)}</span>`,
        author && `<span class="badge">✍ ${escapeHtml(author)}</span>`,
    ].filter(Boolean).join('\n                ');

    const heroImage = imgUrl
        ? `<img class="article-hero-img" src="${escapeHtml(imgUrl)}" alt="${escapeHtml(title)}">`
        : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(title)}</title>
    ${summary ? `<meta name="description" content="${escapeHtml(summary)}">` : ''}
    <style>
        :root {
            --bg: #f4f1ea;
            --surface: #ffffff;
            --text: #101828;
            --muted: #475467;
            --border: #dde3ea;
            --accent: #0f766e;
            --accent-soft: rgba(15,118,110,0.12);
            --shadow: 0 16px 40px rgba(16,24,40,0.08);
        }
        * { box-sizing: border-box; }
        body {
            margin: 0;
            min-height: 100vh;
            font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif;
            color: var(--text);
            background:
                radial-gradient(circle at top left, rgba(15,118,110,0.12), transparent 30%),
                radial-gradient(circle at bottom right, rgba(180,83,9,0.08), transparent 24%),
                var(--bg);
            line-height: 1.6;
        }
        a { color: var(--accent); }
        a:hover { text-decoration: none; }

        .page-wrap {
            max-width: 820px;
            margin: 0 auto;
            padding: 32px 24px 64px;
        }

        .back-link {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            font-weight: 700;
            text-decoration: none;
            margin-bottom: 28px;
            font-size: 0.95rem;
        }

        .article {
            border: 1px solid var(--border);
            border-radius: 24px;
            background: rgba(255,255,255,0.88);
            box-shadow: var(--shadow);
            overflow: hidden;
        }

        .article-hero-img {
            width: 100%;
            max-height: 360px;
            object-fit: cover;
            display: block;
        }

        .article__inner {
            padding: 32px;
        }

        .article__header {
            margin-bottom: 24px;
            padding-bottom: 18px;
            border-bottom: 1px solid var(--border);
        }

        .article__title {
            margin: 0 0 14px;
            font-size: clamp(1.7rem, 2.6vw, 2.7rem);
            line-height: 1.1;
            letter-spacing: -0.03em;
        }

        .article__meta {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            margin-bottom: 12px;
        }

        .badge {
            display: inline-flex;
            align-items: center;
            border-radius: 999px;
            padding: 5px 10px;
            font-size: 0.8rem;
            font-weight: 700;
            background: #eef2ff;
            color: #3730a3;
        }
        .badge--category { background: #ecfdf3; color: #027a48; }
        .badge--date     { background: #fff7ed; color: #b45309; }

        .article__tags {
            font-size: 0.9rem;
            color: var(--muted);
        }
        .tag-pill { color: var(--accent); font-weight: 600; text-decoration: none; }
        .tag-pill:hover { text-decoration: underline; }

        /* Markdown body */
        .markdown-body h1, .markdown-body h2, .markdown-body h3, .markdown-body h4 {
            margin: 1.4em 0 0.5em; line-height: 1.15;
        }
        .markdown-body p, .markdown-body ul, .markdown-body ol,
        .markdown-body blockquote, .markdown-body pre { margin: 0 0 1em; }
        .markdown-body pre {
            overflow: auto; padding: 16px; border-radius: 14px;
            background: #0f172a; color: #e2e8f0;
        }
        .markdown-body code { font-family: Consolas, "Fira Code", monospace; font-size: 0.92em; }
        .markdown-body blockquote {
            border-left: 4px solid var(--accent-soft);
            padding-left: 16px;
            color: var(--muted);
        }
    </style>
</head>
<body>
    <div class="page-wrap">
        <a class="back-link" href="../index.html">← Back to Blog</a>
        <article class="article">
            ${heroImage}
            <div class="article__inner">
                <header class="article__header">
                    <h1 class="article__title">${escapeHtml(title)}</h1>
                    <div class="article__meta">
                ${metaRows}
                    </div>
                    ${tagItems ? `<div class="article__tags">Tags: ${tagItems}</div>` : ''}
                </header>
                <div class="markdown-body">
${bodyHtml}
                </div>
            </div>
        </article>
    </div>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function buildHtml() {
    await fs.mkdir(outputDir, { recursive: true });

    const entries = await fs.readdir(contentDir, { withFileTypes: true });
    const mdFiles = entries
        .filter((e) => e.isFile() && /\.md$/i.test(e.name))
        .map((e) => e.name)
        .sort((a, b) => a.localeCompare(b));

    if (!mdFiles.length) {
        console.warn('No markdown files found in', contentDir);
        return;
    }

    const results = await Promise.all(
        mdFiles.map(async (file) => {
            const markdownText = await fs.readFile(path.join(contentDir, file), 'utf8');
            const { metadata, content } = parseFrontmatter(markdownText);

            const title = metadata.title || file.replace(/\.md$/i, '');
            const category = metadata.category || '';
            const author = metadata.author || '';
            const date = metadata.date || '';
            const tags = parseTags(metadata.tags);
            const imgUrl = metadata.imgurl || '';   // key is lowercased by parseFrontmatter
            const summary = metadata.summary || '';

            const bodyHtml = md.render(content);

            const page = buildPage({ title, category, author, date, tags, imgUrl, summary, bodyHtml, sourceFile: file });
            const outName = file.replace(/\.md$/i, '.html');
            const outPath = path.join(outputDir, outName);
            await fs.writeFile(outPath, page, 'utf8');
            return outName;
        })
    );

    console.log(`Built ${results.length} HTML file(s) → html/`);
    results.forEach((name) => console.log(`  html/${name}`));
}

buildHtml().catch((err) => { console.error(err); process.exit(1); });
