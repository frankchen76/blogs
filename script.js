const md = window.markdownit({
    html: false,
    linkify: true,
    typographer: true,
});

const CONTENT_ROOT = 'content';
const PREVIEW_LIMIT = 6;
const FALLBACK_MARKDOWN_FILES = ['home.md', 'a365-sdk-blueprint.md'];

const state = {
    posts: [],
    postsByFile: {},
    searchQuery: '',
};

function titleFromFileName(file) {
    const base = file.replace(/^.*\//, '').replace(/\.md$/i, '');
    return base
        .replace(/[-_]+/g, ' ')
        .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function normalizeText(text) {
    return String(text || '')
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/`[^`]*`/g, ' ')
        .replace(/!\[[^\]]*\]\([^\)]*\)/g, ' ')
        .replace(/\[([^\]]+)\]\([^\)]*\)/g, '$1')
        .replace(/[#>*_\-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
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

    return raw.length > maxLength ? `${raw.slice(0, maxLength - 1)}…` : raw;
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

async function discoverMarkdownFiles() {
    try {
        const manifestRes = await fetch(`${CONTENT_ROOT}/index.json`);
        if (manifestRes.ok) {
            const data = await manifestRes.json();
            const files = Array.isArray(data) ? data : data.files;
            if (Array.isArray(files)) {
                return files
                    .filter((file) => typeof file === 'string' && /\.md$/i.test(file))
                    .map((file) => file.replace(/^\/+/, ''));
            }
        }
    } catch (err) {
        console.warn('No content/index.json found. Falling back to directory listing.', err);
    }

    try {
        const listingRes = await fetch(`${CONTENT_ROOT}/`);
        if (listingRes.ok) {
            const html = await listingRes.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');

            const files = Array.from(doc.querySelectorAll('a[href]'))
                .map((a) => a.getAttribute('href') || '')
                .map((href) => href.split('?')[0].split('#')[0].replace(/^\/+/, ''))
                .filter((href) => /\.md$/i.test(href))
                .map((href) => href.replace(/^content\//i, ''));

            return Array.from(new Set(files));
        }
    } catch (err) {
        console.warn('Directory listing unavailable. Using built-in fallback manifest.', err);
    }

    return FALLBACK_MARKDOWN_FILES.slice();
}

async function loadPostData(file) {
    const res = await fetch(`${CONTENT_ROOT}/${file}`);
    if (!res.ok) {
        throw new Error(`Unable to load ${file} (HTTP ${res.status}).`);
    }

    const markdownText = await res.text();
    const { metadata, content } = parseFrontmatter(markdownText);
    const tags = String(metadata.tags || '')
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean);
    const dateText = String(metadata.date || '').trim();
    const yearMonth = /^\d{4}-\d{2}/.test(dateText) ? dateText.slice(0, 7) : '';
    const summary = metadata.summary || excerptFromMarkdown(content);

    return {
        file,
        title: metadata.title || titleFromFileName(file),
        category: metadata.category || 'More',
        tags,
        date: dateText,
        yearMonth,
        summary,
        content,
        searchText: normalizeText([metadata.title, metadata.summary, metadata.category, metadata.tags, metadata.date, content].join(' ')),
    };
}

function parseTagsValue(value) {
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

function normalizePostRecord(rawPost) {
    if (!rawPost || typeof rawPost !== 'object') {
        return null;
    }

    const file = String(rawPost.file || '').trim();
    if (!file) {
        return null;
    }

    const content = typeof rawPost.content === 'string' ? rawPost.content : '';
    const tags = Array.isArray(rawPost.tags) ? rawPost.tags : parseTagsValue(rawPost.tags);
    const dateText = String(rawPost.date || '').trim();
    const yearMonth = String(rawPost.yearMonth || '').trim() || (/^\d{4}-\d{2}/.test(dateText)
        ? dateText.slice(0, 7)
        : '');
    const title = String(rawPost.title || titleFromFileName(file)).trim();
    const category = String(rawPost.category || 'More').trim() || 'More';
    const summary = String(rawPost.summary || excerptFromMarkdown(content)).trim();
    const author = String(rawPost.author || '').trim();
    const imgUrl = String(rawPost.imgUrl || '').trim();

    return {
        file,
        title,
        category,
        tags,
        date: dateText,
        yearMonth,
        summary,
        author,
        imgUrl,
        content,
        searchText: normalizeText([title, summary, category, author, tags.join(','), dateText, content].join(' ')),
    };
}

async function loadPostsFromIndex() {
    try {
        const res = await fetch(`${CONTENT_ROOT}/index.json`);
        if (!res.ok) {
            return [];
        }

        const data = await res.json();
        const rawPosts = Array.isArray(data)
            ? (data.length > 0 && typeof data[0] === 'object' ? data : [])
            : (Array.isArray(data.posts) ? data.posts : []);

        if (!rawPosts.length) {
            return [];
        }

        return rawPosts
            .map((post) => normalizePostRecord(post))
            .filter(Boolean);
    } catch (err) {
        console.warn('Unable to load prebuilt post index. Falling back to markdown fetch.', err);
        return [];
    }
}

function groupPostsByKey(posts, keySelector) {
    const grouped = {};
    for (const post of posts) {
        const key = keySelector(post);
        if (!key) {
            continue;
        }

        if (!grouped[key]) {
            grouped[key] = [];
        }
        grouped[key].push(post);
    }

    for (const key of Object.keys(grouped)) {
        grouped[key].sort((a, b) => {
            const dateCompare = (b.date || '').localeCompare(a.date || '');
            return dateCompare || a.title.localeCompare(b.title);
        });
    }

    return grouped;
}

function groupByCategory(posts) {
    return groupPostsByKey(posts, (post) => post.category);
}

function buildTagIndex(posts) {
    const grouped = {};

    for (const post of posts) {
        for (const tag of post.tags) {
            if (!grouped[tag]) {
                grouped[tag] = [];
            }
            grouped[tag].push(post);
        }
    }

    for (const tag of Object.keys(grouped)) {
        grouped[tag].sort((a, b) => {
            const dateCompare = (b.date || '').localeCompare(a.date || '');
            return dateCompare || a.title.localeCompare(b.title);
        });
    }

    return grouped;
}

function buildDateIndex(posts) {
    return groupPostsByKey(posts, (post) => post.yearMonth);
}

function getSortedEntries(map, comparator = (a, b) => a.localeCompare(b)) {
    return Object.keys(map).sort(comparator);
}

function getFilteredPosts(posts, query) {
    const normalized = normalizeText(query);
    if (!normalized) {
        return posts;
    }

    const parts = normalized.split(' ').filter(Boolean);
    return posts.filter((post) => parts.every((part) => post.searchText.includes(part)));
}

function clearElement(element) {
    while (element.firstChild) {
        element.removeChild(element.firstChild);
    }
}

function createBadge(text, className = '') {
    const span = document.createElement('span');
    span.className = `badge ${className}`.trim();
    span.textContent = text;
    return span;
}

function renderPostCard(post) {
    const article = document.createElement('article');
    article.className = 'post-card';

    const header = document.createElement('header');
    header.className = 'post-card__header';

    const title = document.createElement('h3');
    title.className = 'post-card__title';
    const link = document.createElement('a');
    link.href = `#post/${encodeURIComponent(post.file.replace(/\.md$/i, ''))}`;
    link.textContent = post.title;
    title.appendChild(link);
    header.appendChild(title);

    const meta = document.createElement('div');
    meta.className = 'post-card__meta';
    meta.appendChild(createBadge(post.category, 'badge--category'));
    if (post.date) {
        meta.appendChild(createBadge(post.date, 'badge--date'));
    }
    header.appendChild(meta);

    if (post.imgUrl) {
        const img = document.createElement('img');
        img.className = 'post-card__image';
        img.src = post.imgUrl;
        img.alt = post.title;
        img.style.width = '100%';
        img.style.height = '200px';
        img.style.objectFit = 'cover';
        img.style.marginBottom = '12px';
        img.style.borderRadius = '4px';
        article.appendChild(img);
    }

    const summary = document.createElement('p');
    summary.className = 'post-card__summary';
    summary.textContent = post.summary;

    const footer = document.createElement('footer');
    footer.className = 'post-card__footer';

    const tagWrap = document.createElement('div');
    tagWrap.className = 'post-card__tags';
    tagWrap.appendChild(document.createTextNode('Tags: '));
    post.tags.forEach((tag, index) => {
        const tagLink = document.createElement('a');
        tagLink.href = `#tag/${encodeURIComponent(tag)}`;
        tagLink.className = 'tag-pill';
        tagLink.textContent = tag;
        tagWrap.appendChild(tagLink);
        if (index < post.tags.length - 1) {
            tagWrap.appendChild(document.createTextNode(', '));
        }
    });

    const readMore = document.createElement('a');
    readMore.className = 'read-more';
    readMore.href = `#post/${encodeURIComponent(post.file.replace(/\.md$/i, ''))}`;
    readMore.textContent = 'Read more';

    footer.appendChild(tagWrap);
    footer.appendChild(readMore);

    article.appendChild(header);
    article.appendChild(summary);
    article.appendChild(footer);
    return article;
}

function renderCardGrid(posts, emptyMessage = 'No posts found.') {
    const container = document.createElement('section');
    container.className = 'card-grid';

    if (!posts.length) {
        const empty = document.createElement('div');
        empty.className = 'empty-state';
        empty.textContent = emptyMessage;
        container.appendChild(empty);
        return container;
    }

    for (const post of posts) {
        container.appendChild(renderPostCard(post));
    }

    return container;
}

function renderIndexList(title, subtitle, entries, buildHref, buildMeta) {
    const section = document.createElement('section');
    section.className = 'index-panel';

    const heading = document.createElement('div');
    heading.className = 'section-heading';

    const h1 = document.createElement('h1');
    h1.textContent = title;
    heading.appendChild(h1);

    if (subtitle) {
        const p = document.createElement('p');
        p.textContent = subtitle;
        heading.appendChild(p);
    }

    section.appendChild(heading);

    const list = document.createElement('div');
    list.className = 'index-list';

    for (const entry of entries) {
        const item = document.createElement('article');
        item.className = 'index-list__item';

        const link = document.createElement('a');
        link.className = 'index-list__title';
        link.href = buildHref(entry);
        link.textContent = entry.label;
        item.appendChild(link);

        const meta = document.createElement('div');
        meta.className = 'index-list__meta';
        meta.textContent = buildMeta(entry);
        item.appendChild(meta);

        list.appendChild(item);
    }

    section.appendChild(list);
    return section;
}

function renderPostView(post) {
    const content = document.getElementById('content');
    clearElement(content);

    const article = document.createElement('article');
    article.className = 'article-view';

    const header = document.createElement('header');
    header.className = 'article-view__header';

    const titleRow = document.createElement('div');
    titleRow.className = 'article-view__title-row';

    const title = document.createElement('h1');
    title.textContent = post.title;
    titleRow.appendChild(title);

    const htmlVersionLink = document.createElement('a');
    htmlVersionLink.className = 'article-view__html-link';
    htmlVersionLink.href = `#post/${encodeURIComponent(post.file.replace(/\.md$/i, ''))}?html`;
    htmlVersionLink.setAttribute('aria-label', 'Open HTML version');
    htmlVersionLink.title = 'Open HTML version';
    htmlVersionLink.innerHTML = `
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M14 3h7v7"></path>
            <path d="M10 14L21 3"></path>
            <path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"></path>
        </svg>
        <span class="sr-only">Open HTML version</span>
    `;
    titleRow.appendChild(htmlVersionLink);
    header.appendChild(titleRow);

    const meta = document.createElement('div');
    meta.className = 'article-view__meta';
    meta.appendChild(createBadge(post.category, 'badge--category'));
    if (post.date) {
        meta.appendChild(createBadge(post.date, 'badge--date'));
    }
    header.appendChild(meta);

    if (post.summary) {
        const summary = document.createElement('p');
        summary.className = 'article-view__summary';
        summary.textContent = post.summary;
        header.appendChild(summary);
    }

    const tagWrap = document.createElement('div');
    tagWrap.className = 'article-view__tags';
    if (post.tags.length > 0) {
        tagWrap.appendChild(document.createTextNode('Tags: '));
        post.tags.forEach((tag, index) => {
            const tagLink = document.createElement('a');
            tagLink.href = `#tag/${encodeURIComponent(tag)}`;
            tagLink.className = 'tag-pill';
            tagLink.textContent = tag;
            tagWrap.appendChild(tagLink);
            if (index < post.tags.length - 1) {
                tagWrap.appendChild(document.createTextNode(', '));
            }
        });
    }
    header.appendChild(tagWrap);

    article.appendChild(header);

    const body = document.createElement('div');
    body.className = 'markdown-body';
    body.innerHTML = md.render(post.content);
    article.appendChild(body);

    content.appendChild(article);
    document.title = `${post.title} | Markdown Client Render`;
}

function renderHomeView(posts, query = '') {
    const filtered = getFilteredPosts(posts, query)
        .slice()
        .sort((a, b) => (b.date || '').localeCompare(a.date || '') || a.title.localeCompare(b.title));

    const content = document.getElementById('content');
    clearElement(content);

    const hero = document.createElement('section');
    hero.className = 'hero';

    const h1 = document.createElement('h1');
    h1.textContent = query ? `Search results for “${query}”` : 'Home';
    hero.appendChild(h1);

    const p = document.createElement('p');
    p.textContent = query
        ? `Showing ${filtered.length} matching markdown file${filtered.length === 1 ? '' : 's'}.`
        : 'Summary pages for all markdown files in the content folder.';
    hero.appendChild(p);

    const actions = document.createElement('div');
    actions.className = 'hero__actions';

    const categoriesLink = document.createElement('a');
    categoriesLink.className = 'tag-pill';
    categoriesLink.href = '#categories';
    categoriesLink.textContent = 'View categories';
    actions.appendChild(categoriesLink);

    const tagsLink = document.createElement('a');
    tagsLink.className = 'tag-pill';
    tagsLink.href = '#tags';
    tagsLink.textContent = 'View tags';
    actions.appendChild(tagsLink);

    const archivesLink = document.createElement('a');
    archivesLink.className = 'tag-pill';
    archivesLink.href = '#archives';
    archivesLink.textContent = 'View archives';
    actions.appendChild(archivesLink);

    hero.appendChild(actions);

    content.appendChild(hero);
    content.appendChild(renderCardGrid(filtered, query ? 'No matching posts.' : 'No markdown files found.'));
    document.title = query ? `${query} | Markdown Client Render` : 'Markdown Client Render';
}

function renderGroupView(type, key, posts, description) {
    const content = document.getElementById('content');
    clearElement(content);

    const hero = document.createElement('section');
    hero.className = 'hero hero--compact';

    const h1 = document.createElement('h1');
    h1.textContent = description;
    hero.appendChild(h1);

    const p = document.createElement('p');
    p.textContent = `${posts.length} post${posts.length === 1 ? '' : 's'} in this view.`;
    hero.appendChild(p);

    content.appendChild(hero);
    content.appendChild(renderCardGrid(posts, 'No posts available.'));
    document.title = `${description} | Markdown Client Render`;
}

function renderOverviewPage(pageTitle, description, entries, buildHref, buildMeta) {
    const content = document.getElementById('content');
    clearElement(content);
    content.appendChild(renderIndexList(pageTitle, description, entries, buildHref, buildMeta));
    document.title = `${pageTitle} | Markdown Client Render`;
}

function renderSidebar(postsByCategory, postsByTag, postsByDate) {
    const sidebar = document.getElementById('sidebar');
    clearElement(sidebar);

    const brand = document.createElement('div');
    brand.className = 'brand';

    const logo = document.createElement('div');
    logo.className = 'brand__logo';
    logo.textContent = 'LOGO';
    brand.appendChild(logo);

    const name = document.createElement('div');
    name.className = 'brand__name';
    name.textContent = 'The Custom Engine';
    brand.appendChild(name);

    const description = document.createElement('div');
    description.className = 'brand__description';
    description.textContent = 'Technical examples and best practices for markdown-powered content.';
    brand.appendChild(description);

    sidebar.appendChild(brand);

    const nav = document.createElement('div');
    nav.className = 'sidebar-nav';

    const sections = [
        {
            title: 'Category',
            moreLabel: 'View all categories',
            moreHash: '#categories',
            entries: getSortedEntries(postsByCategory),
            buildLabel: (entry) => `${entry} (${postsByCategory[entry].length})`,
            buildHref: (entry) => `#category/${encodeURIComponent(entry)}`,
        },
        {
            title: 'Tag navigation',
            moreLabel: 'View all tags',
            moreHash: '#tags',
            entries: getSortedEntries(postsByTag),
            buildLabel: (entry) => `${entry} (${postsByTag[entry].length})`,
            buildHref: (entry) => `#tag/${encodeURIComponent(entry)}`,
        },
        {
            title: 'Publish date',
            moreLabel: 'View all archives',
            moreHash: '#archives',
            entries: getSortedEntries(postsByDate, (a, b) => b.localeCompare(a)),
            buildLabel: (entry) => `${entry} (${postsByDate[entry].length})`,
            buildHref: (entry) => `#archive/${encodeURIComponent(entry)}`,
        },
    ];

    for (const sectionInfo of sections) {
        const section = document.createElement('section');
        section.className = 'sidebar-section';

        const heading = document.createElement('div');
        heading.className = 'sidebar-section__heading';
        heading.textContent = sectionInfo.title;
        section.appendChild(heading);

        const list = document.createElement('ul');
        list.className = 'sidebar-section__list';

        const preview = sectionInfo.entries.slice(0, PREVIEW_LIMIT);
        for (const entry of preview) {
            const item = document.createElement('li');
            const link = document.createElement('a');
            link.href = sectionInfo.buildHref(entry);
            link.setAttribute('data-nav-link', 'true');
            link.textContent = sectionInfo.buildLabel(entry);
            item.appendChild(link);
            list.appendChild(item);
        }

        section.appendChild(list);

        if (sectionInfo.entries.length > PREVIEW_LIMIT) {
            const more = document.createElement('a');
            more.className = 'sidebar-section__more';
            more.setAttribute('data-nav-link', 'true');
            more.href = sectionInfo.moreHash;
            more.textContent = sectionInfo.moreLabel;
            section.appendChild(more);
        }

        nav.appendChild(section);
    }

    sidebar.appendChild(nav);
}

function setActiveNavFromHash(hash) {
    document.querySelectorAll('[data-nav-link]').forEach((link) => {
        link.classList.toggle('is-active', link.getAttribute('href') === hash);
    });
}

function buildShellData(posts) {
    const postsByCategory = groupByCategory(posts);
    const postsByTag = buildTagIndex(posts);
    const postsByDate = buildDateIndex(posts);
    return { postsByCategory, postsByTag, postsByDate };
}

function parseHash() {
    const raw = decodeURIComponent((location.hash || '').replace(/^#/, ''));
    if (!raw) {
        return { page: 'home' };
    }

    if (raw === 'categories') return { page: 'categories' };
    if (raw === 'tags') return { page: 'tags' };
    if (raw === 'archives') return { page: 'archives' };
    if (raw.startsWith('search/')) return { page: 'search', query: raw.slice('search/'.length) };
    if (raw.startsWith('category/')) return { page: 'category', key: raw.slice('category/'.length) };
    if (raw.startsWith('tag/')) return { page: 'tag', key: raw.slice('tag/'.length) };
    if (raw.startsWith('archive/')) return { page: 'archive', key: raw.slice('archive/'.length) };
    if (raw.startsWith('post/')) {
        const rest = raw.slice('post/'.length);
        const html = rest.endsWith('?html');
        const file = (html ? rest.slice(0, -5) : rest).replace(/\.md$/i, '');
        return { page: 'post', file, html };
    }
    if (raw.endsWith('.md')) return { page: 'post', file: raw.replace(/\.md$/i, ''), html: false };

    return { page: 'home' };
}

function syncSearchInput(query) {
    const input = document.getElementById('searchInput');
    if (input && input.value !== query) {
        input.value = query;
    }
}

function updateHashFromSearch(query) {
    const normalized = query.trim();
    if (!normalized) {
        history.replaceState(null, '', '#');
        return;
    }

    history.replaceState(null, '', `#search/${encodeURIComponent(normalized)}`);
}

async function init() {
    try {
        let posts = await loadPostsFromIndex();
        if (!posts.length) {
            const files = (await discoverMarkdownFiles()).sort((a, b) => a.localeCompare(b));
            posts = await Promise.all(files.map((file) => loadPostData(file)));
        }

        state.posts = posts;
        state.postsByFile = Object.fromEntries(posts.map((post) => [post.file, post]));

        const { postsByCategory, postsByTag, postsByDate } = buildShellData(posts);
        renderSidebar(postsByCategory, postsByTag, postsByDate);

        const searchButton = document.getElementById('searchButton');
        const searchPanel = document.getElementById('searchPanel');
        const searchInput = document.getElementById('searchInput');
        const hasSearchUI = Boolean(searchButton && searchPanel && searchInput);
        const openSearchPanel = () => {
            if (!hasSearchUI) {
                return;
            }

            searchPanel.hidden = false;
            searchButton.setAttribute('aria-expanded', 'true');
            window.setTimeout(() => searchInput.focus(), 0);
        };

        const closeSearchPanel = () => {
            if (!hasSearchUI) {
                return;
            }

            searchPanel.hidden = true;
            searchButton.setAttribute('aria-expanded', 'false');
        };

        if (hasSearchUI) {
            searchButton.addEventListener('click', () => {
                if (searchPanel.hidden) {
                    openSearchPanel();
                } else {
                    closeSearchPanel();
                }
            });
        }

        let searchTimer = null;
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                const nextValue = searchInput.value;
                state.searchQuery = nextValue;
                if (hasSearchUI && nextValue.trim()) {
                    openSearchPanel();
                } else if (hasSearchUI) {
                    closeSearchPanel();
                }
                clearTimeout(searchTimer);
                searchTimer = window.setTimeout(() => {
                    updateHashFromSearch(nextValue);
                    renderRoute();
                }, 120);
            });

            searchInput.addEventListener('keydown', (event) => {
                if (event.key === 'Escape') {
                    closeSearchPanel();
                    if (searchButton) {
                        searchButton.focus();
                    }
                }
            });
        }

        if (hasSearchUI) {
            document.addEventListener('click', (event) => {
                if (searchPanel.hidden) {
                    return;
                }

                if (searchPanel.contains(event.target) || searchButton.contains(event.target)) {
                    return;
                }

                closeSearchPanel();
            });
        }

        async function renderRoute() {
            const route = parseHash();
            const topSearchQuery = route.page === 'search' ? route.query : state.searchQuery;
            syncSearchInput(topSearchQuery);
            state.searchQuery = topSearchQuery;

            if (hasSearchUI && (route.page === 'search' || topSearchQuery.trim())) {
                openSearchPanel();
            }

            switch (route.page) {
                case 'categories': {
                    const entries = getSortedEntries(postsByCategory).map((key) => ({
                        key,
                        label: key,
                        count: postsByCategory[key].length,
                    }));
                    renderOverviewPage(
                        'Categories',
                        'Browse all categories in the collection.',
                        entries,
                        (entry) => `#category/${encodeURIComponent(entry.key)}`,
                        (entry) => `${entry.count} post${entry.count === 1 ? '' : 's'}`
                    );
                    break;
                }
                case 'tags': {
                    const entries = getSortedEntries(postsByTag).map((key) => ({
                        key,
                        label: key,
                        count: postsByTag[key].length,
                    }));
                    renderOverviewPage(
                        'Tags',
                        'Browse all tags in the collection.',
                        entries,
                        (entry) => `#tag/${encodeURIComponent(entry.key)}`,
                        (entry) => `${entry.count} post${entry.count === 1 ? '' : 's'}`
                    );
                    break;
                }
                case 'archives': {
                    const entries = getSortedEntries(postsByDate, (a, b) => b.localeCompare(a)).map((key) => ({
                        key,
                        label: key,
                        count: postsByDate[key].length,
                    }));
                    renderOverviewPage(
                        'Archives',
                        'Browse posts by publish month.',
                        entries,
                        (entry) => `#archive/${encodeURIComponent(entry.key)}`,
                        (entry) => `${entry.count} post${entry.count === 1 ? '' : 's'}`
                    );
                    break;
                }
                case 'category': {
                    const key = route.key;
                    const postsInCategory = postsByCategory[key] || [];
                    renderGroupView('category', key, postsInCategory, `Category: ${key}`);
                    break;
                }
                case 'tag': {
                    const key = route.key;
                    const postsInTag = postsByTag[key] || [];
                    renderGroupView('tag', key, postsInTag, `Tag: ${key}`);
                    break;
                }
                case 'archive': {
                    const key = route.key;
                    const postsInMonth = postsByDate[key] || [];
                    renderGroupView('archive', key, postsInMonth, `Archive: ${key}`);
                    break;
                }
                case 'post': {
                    if (route.html) {
                        window.location.href = `html/${route.file}.html`;
                        return;
                    }
                    const post = state.postsByFile[route.file]
                        || state.postsByFile[`${route.file}.md`];
                    if (post) {
                        if (!post.content) {
                            const hydrated = await loadPostData(post.file);
                            Object.assign(post, hydrated);
                            state.postsByFile[post.file] = post;
                        }
                        renderPostView(post);
                    } else {
                        renderHomeView(posts, state.searchQuery);
                    }
                    break;
                }
                case 'search': {
                    renderHomeView(posts, route.query);
                    break;
                }
                default: {
                    renderHomeView(posts, state.searchQuery);
                    break;
                }
            }

            const activeHash = location.hash || '#';
            setActiveNavFromHash(activeHash);
        }

        window.addEventListener('hashchange', renderRoute);
        renderRoute();
    } catch (err) {
        document.getElementById('sidebar').textContent = 'Failed to build navigation.';
        document.getElementById('content').innerHTML = '<p style="color:red;">Error loading content.</p>';
        console.error(err);
    }
}

init();
