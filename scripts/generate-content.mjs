import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import MarkdownIt from "markdown-it";

const contentRoot = path.resolve("src/content/writings");
const generatedDir = path.resolve("src/content/generated");
const generatedPath = path.join(generatedDir, "writings.json");
const publicWritingsDir = path.resolve("public/writings");
const wordsPerMinute = 220;

function parseScalar(value) {
  const trimmed = value.trim();

  if (trimmed === "true") return true;
  if (trimmed === "false") return false;

  if (/^\d+(?:\.\d+)?$/.test(trimmed)) {
    return Number(trimmed);
  }

  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed
        .slice(1, -1)
        .split(",")
        .map((item) => parseScalar(item))
        .filter(Boolean);
    }
  }

  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return JSON.parse(trimmed);
  }

  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function parseFrontmatterBlock(block, articlePath) {
  const data = {};
  const lines = block.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (!line.trim()) continue;

    const match = line.match(/^([A-Za-z][\w-]*):(?:\s*(.*))?$/);
    if (!match) {
      throw new Error(`Invalid frontmatter line in ${articlePath}: ${line}`);
    }

    const [, key, rawValue = ""] = match;

    if (rawValue.trim() !== "") {
      data[key] = parseScalar(rawValue);
      continue;
    }

    const values = [];
    while (index + 1 < lines.length) {
      const nextLine = lines[index + 1];
      const itemMatch = nextLine.match(/^\s*-\s+(.+)$/);

      if (!itemMatch) break;

      values.push(parseScalar(itemMatch[1]));
      index += 1;
    }

    data[key] = values;
  }

  return data;
}

function parseFrontmatter(source, articlePath) {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);

  if (!match) {
    throw new Error(`Missing frontmatter in ${articlePath}`);
  }

  return {
    data: parseFrontmatterBlock(match[1], articlePath),
    content: source.slice(match[0].length),
  };
}

function isExternalUrl(value) {
  return /^(?:[a-z]+:)?\/\//i.test(value) || /^(?:data|mailto|tel):/i.test(value);
}

function normalizeLocalAssetPath(value) {
  if (!value || value.startsWith("#") || value.startsWith("/") || isExternalUrl(value)) {
    return value;
  }

  return value.replace(/^\.\//, "");
}

function slugifyHeading(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/<[^>]+>/g, "")
    .replace(/&[a-z0-9#]+;/gi, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function uniqueSlug(value, seen) {
  const base = slugifyHeading(value) || "section";
  const count = seen.get(base) ?? 0;
  seen.set(base, count + 1);
  return count === 0 ? base : `${base}-${count + 1}`;
}

function unescapeMarkdownText(value) {
  return value.replace(/\\([\\`*{}\[\]()#+\-.!_>])/g, "$1");
}

function rewriteRawHtmlAssetPaths(html) {
  return html.replace(/\s(src)=["']([^"']+)["']/gi, (match, attr, value) => {
    return ` ${attr}="${normalizeLocalAssetPath(value)}"`;
  });
}

function createRenderer(toc) {
  const seenHeadings = new Map();
  const markdown = new MarkdownIt({
    html: true,
    linkify: false,
    typographer: false,
  });

  markdown.renderer.rules.heading_open = (tokens, index, options, env, self) => {
    const token = tokens[index];
    const inline = tokens[index + 1];
    const title = unescapeMarkdownText(inline?.content ?? "");
    const id = uniqueSlug(title, seenHeadings);
    const level = Number(token.tag.slice(1));

    token.attrSet("id", id);

    if (
      level >= 2 &&
      level <= 4 &&
      title.toLowerCase() !== "table of contents"
    ) {
      toc.push({ id, title, level });
    }

    return self.renderToken(tokens, index, options);
  };

  const defaultImage =
    markdown.renderer.rules.image ??
    ((tokens, index, options, env, self) => self.renderToken(tokens, index, options));

  markdown.renderer.rules.image = (tokens, index, options, env, self) => {
    const token = tokens[index];
    const src = token.attrGet("src");

    if (src) {
      token.attrSet("src", normalizeLocalAssetPath(src));
    }

    return defaultImage(tokens, index, options, env, self);
  };

  return markdown;
}

function textForReadingTime(markdownBody) {
  return markdownBody
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, " ")
    .replace(/\[[^\]]+\]\([^)]+\)/g, " ")
    .replace(/[#>*_\-[\]()`|]/g, " ");
}

function calculateReadingTime(markdownBody) {
  const words = textForReadingTime(markdownBody)
    .split(/\s+/)
    .filter(Boolean).length;

  return Math.max(1, Math.ceil(words / wordsPerMinute));
}

function normalizeTags(value, articlePath) {
  if (Array.isArray(value)) {
    return value.map(String).filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
  }

  throw new Error(`Expected tags array in ${articlePath}`);
}

function requireString(value, field, articlePath) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Expected non-empty ${field} in ${articlePath}`);
  }

  return value.trim();
}

function requireDate(value, articlePath) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  return requireString(value, "date", articlePath);
}

function normalizeReadingTime(value, markdownBody) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.ceil(value);
  }

  return calculateReadingTime(markdownBody);
}

async function readArticle(dirent) {
  const slug = dirent.name;
  const articleDir = path.join(contentRoot, slug);
  const articlePath = path.join(articleDir, "index.md");
  let source;

  try {
    source = await readFile(articlePath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }

  const parsed = parseFrontmatter(source, articlePath);

  if (parsed.data.draft === true) {
    return null;
  }

  const title = requireString(parsed.data.title, "title", articlePath);
  const description = requireString(
    parsed.data.description,
    "description",
    articlePath,
  );
  const date = requireDate(parsed.data.date, articlePath);
  const tags = normalizeTags(parsed.data.tags, articlePath);
  const readingTime = normalizeReadingTime(parsed.data.readingTime, parsed.content);
  const toc = [];
  const renderer = createRenderer(toc);
  const bodyHtml = rewriteRawHtmlAssetPaths(renderer.render(parsed.content)).trim();

  return {
    slug,
    title,
    description,
    date,
    readingTime,
    tags,
    bodyHtml,
    toc,
  };
}

async function copyPublishedImages(writings) {
  await rm(publicWritingsDir, { recursive: true, force: true });

  await Promise.all(
    writings.map(async (writing) => {
      const source = path.join(contentRoot, writing.slug, "images");
      const destination = path.join(publicWritingsDir, writing.slug, "images");

      try {
        await cp(source, destination, { recursive: true });
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
      }
    }),
  );
}

const dirents = await readdir(contentRoot, { withFileTypes: true });
const writings = (
  await Promise.all(dirents.filter((dirent) => dirent.isDirectory()).map(readArticle))
)
  .filter(Boolean)
  .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

await mkdir(generatedDir, { recursive: true });
await writeFile(generatedPath, `${JSON.stringify(writings, null, 2)}\n`);
await copyPublishedImages(writings);

console.log(`Generated ${writings.length} writing entries.`);
