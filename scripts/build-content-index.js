const fs = require('node:fs/promises');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');
const contentDir = path.join(rootDir, 'content');
const outputFile = path.join(contentDir, 'index.json');

function titleFromFileName(file) {
    const base = file.replace(/^.*\//, '').replace(/\.md$/i, '');
    return base
        .replace(/[-_]+/g, ' ')
        .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function excerptFromMarkdown(content, maxLength = 220) {
    const lines = String(content || '').replace(/\r/g, '').split('\n');
    const paragraph = [];

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
            if (paragraph.length > 0) {
                break;
            }
            continue;
        }

        if (trimmed.startsWith('#') || trimmed.startsWith('>') || trimmed.startsWith('```') || trimmed.startsWith('- ')) {
            if (paragraph.length === 0) {
                continue;
            }
        }

        paragraph.push(trimmed);
    }

    const raw = paragraph.join(' ')
        .replace(/\[([^\]]+)\]\([^\)]*\)/g, '$1')
        .replace(/[*_`>#]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    if (!raw) {
        return 'No summary available.';
    }

    return raw.length > maxLength ? `${raw.slice(0, maxLength - 1)}...` : raw;
}

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
        if (!trimmed || trimmed.startsWith('#')) {
            continue;
        }

        const separator = trimmed.indexOf(':');
        if (separator === -1) {
            continue;
        }

        const key = trimmed.slice(0, separator).trim().toLowerCase();
        const value = trimmed.slice(separator + 1).trim();
        if (key) {
            metadata[key] = value;
        }
    }

    return { metadata, content };
}

function parseTags(value) {
    if (Array.isArray(value)) {
        return value
            .map((tag) => String(tag).trim())
            .filter(Boolean);
    }

    return String(value || '')
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean);
}

async function buildIndex() {
    const dirEntries = await fs.readdir(contentDir, { withFileTypes: true });
    const files = dirEntries
        .filter((entry) => entry.isFile() && /\.md$/i.test(entry.name))
        .map((entry) => entry.name)
        .sort((a, b) => a.localeCompare(b));

    const posts = [];
    for (const file of files) {
        const markdownText = await fs.readFile(path.join(contentDir, file), 'utf8');
        const { metadata, content } = parseFrontmatter(markdownText);
        const dateText = String(metadata.date || '').trim();

        posts.push({
            file,
            title: metadata.title || titleFromFileName(file),
            category: metadata.category || 'More',
            tags: parseTags(metadata.tags),
            date: dateText,
            yearMonth: /^\d{4}-\d{2}/.test(dateText) ? dateText.slice(0, 7) : '',
            summary: metadata.summary || excerptFromMarkdown(content),
            author: metadata.author || '',
            status: metadata.status || '',
            imgUrl: metadata.imgurl || '',
        });
    }

    const payload = {
        generatedAt: new Date().toISOString(),
        count: posts.length,
        posts,
    };

    await fs.writeFile(outputFile, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    console.log(`Generated ${outputFile} with ${posts.length} posts.`);
}

buildIndex().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
