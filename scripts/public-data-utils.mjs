import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ASSET_BASE_URL = 'https://enem.dev';
export const ENEM_DISCIPLINES = [
  'ciencias-humanas',
  'ciencias-natureza',
  'linguagens',
  'matematica',
];
export const ENEM_LANGUAGES = ['espanhol', 'ingles'];
export const ENEM_ALTERNATIVE_LETTERS = ['A', 'B', 'C', 'D', 'E'];

const MARKDOWN_IMAGE_REGEX = /!\[([^\]]*)\]\(([^)\s]+)([^)]*)\)/g;
const SUBSCRIPT = new Map(
  Object.entries({
    0: '₀',
    1: '₁',
    2: '₂',
    3: '₃',
    4: '₄',
    5: '₅',
    6: '₆',
    7: '₇',
    8: '₈',
    9: '₉',
    '+': '₊',
    '-': '₋',
    '=': '₌',
    '(': '₍',
    ')': '₎',
  }),
);
const SUPERSCRIPT = new Map(
  Object.entries({
    0: '⁰',
    1: '¹',
    2: '²',
    3: '³',
    4: '⁴',
    5: '⁵',
    6: '⁶',
    7: '⁷',
    8: '⁸',
    9: '⁹',
    '+': '⁺',
    '-': '⁻',
    '=': '⁼',
    '(': '⁽',
    ')': '⁾',
  }),
);
const HTML_ENTITIES = new Map(
  Object.entries({
    amp: '&',
    apos: "'",
    gt: '>',
    iacute: 'í',
    lt: '<',
    nbsp: ' ',
    quot: '"',
  }),
);

function getRepoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
}

export function getPublicDirectory() {
  return path.join(getRepoRoot(), 'public');
}

export function readJsonFile(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

export function writeJsonFile(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function findQuestionDetailFiles(publicDirectory = getPublicDirectory()) {
  const files = [];

  for (const year of readdirSync(publicDirectory, { withFileTypes: true })) {
    if (!year.isDirectory()) {
      continue;
    }

    const questionsDirectory = path.join(
      publicDirectory,
      year.name,
      'questions',
    );

    if (!existsSync(questionsDirectory)) {
      continue;
    }

    for (const variant of readdirSync(questionsDirectory, {
      withFileTypes: true,
    })) {
      if (!variant.isDirectory()) {
        continue;
      }

      const detailsPath = path.join(
        questionsDirectory,
        variant.name,
        'details.json',
      );

      if (existsSync(detailsPath)) {
        files.push(detailsPath);
      }
    }
  }

  return files.sort((left, right) =>
    path
      .relative(publicDirectory, left)
      .localeCompare(path.relative(publicDirectory, right), 'en', {
        numeric: true,
      }),
  );
}

export function getQuestionPathParts(filePath) {
  const variantKey = path.basename(path.dirname(filePath));
  const year = Number(path.basename(path.dirname(path.dirname(path.dirname(filePath)))));

  return { variantKey, year };
}

function convertCharacters(value, map) {
  return [...value].map((character) => map.get(character) ?? character).join('');
}

function decodeHtmlEntities(value) {
  return value.replace(/&([a-z]+);/gi, (match, entity) => {
    return HTML_ENTITIES.get(entity.toLowerCase()) ?? match;
  });
}

function normalizeInlineHtml(value) {
  return decodeHtmlEntities(value)
    .replace(/<sub>(.*?)<\/sub>/gi, (_match, inner) =>
      convertCharacters(inner, SUBSCRIPT),
    )
    .replace(/<sup>(.*?)<\/sup>/gi, (_match, inner) =>
      convertCharacters(inner, SUPERSCRIPT),
    )
    .replace(/<strong>(.*?)<\/strong>/gi, '**$1**')
    .replace(/<\/?p\b[^>]*>/gi, '')
    .replace(/<([^>]+)>/g, (match, inner) => {
      return /^https?:\/\//i.test(inner.trim()) ? match : `&lt;${inner}&gt;`;
    });
}

export function normalizeMarkdown(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = normalizeInlineHtml(String(value))
    .replace(/\u00a0/g, ' ')
    .replace(/\\([-+*_.()[\]])/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return normalized.length > 0 ? normalized : null;
}

export function toRelativeAssetPath(urlOrPath) {
  if (urlOrPath.startsWith(`${ASSET_BASE_URL}/`)) {
    return new URL(urlOrPath).pathname;
  }

  if (urlOrPath.startsWith('/')) {
    return urlOrPath;
  }

  throw new Error(`Unsupported asset reference: ${urlOrPath}`);
}

export function rewriteMarkdownImages(value) {
  const normalized = normalizeMarkdown(value);
  const paths = [];

  if (!normalized) {
    return { markdown: normalized, paths };
  }

  const markdown = normalized.replace(
    MARKDOWN_IMAGE_REGEX,
    (_match, alt, url, suffix) => {
      const relativePath = toRelativeAssetPath(url);
      paths.push(relativePath);

      return `![${alt}](${relativePath}${suffix})`;
    },
  );

  return { markdown, paths };
}

function createAsset({ alternativeLetter, path: assetPath, questionId, role, position }) {
  return {
    id: `${questionId}:asset:${position}`,
    path: assetPath,
    role,
    position,
    alternativeLetter,
  };
}

function getExistingAssetsById(rawQuestion) {
  const assets = Array.isArray(rawQuestion.assets) ? rawQuestion.assets : [];

  return new Map(assets.map((asset) => [asset.id, asset]));
}

export function normalizeQuestionDetails(rawQuestion, filePath) {
  const { variantKey, year } = getQuestionPathParts(filePath);
  const questionId = `${year}:${variantKey}`;
  const existingAssetsById = getExistingAssetsById(rawQuestion);
  const context = rewriteMarkdownImages(
    rawQuestion.contextMarkdown ?? rawQuestion.context ?? null,
  );
  const alternativesIntroduction = rewriteMarkdownImages(
    rawQuestion.alternativesIntroductionMarkdown ??
      rawQuestion.alternativesIntroduction ??
      null,
  );
  const assets = [];

  function addAsset(assetPath, role, alternativeLetter) {
    const asset = createAsset({
      alternativeLetter,
      path: assetPath,
      questionId,
      role,
      position: assets.length,
    });

    assets.push(asset);

    return asset.id;
  }

  for (const assetPath of [
    ...context.paths,
    ...alternativesIntroduction.paths,
  ]) {
    addAsset(assetPath, 'context', null);
  }

  const referencedContextPaths = new Set(assets.map((asset) => asset.path));

  for (const url of rawQuestion.files ?? []) {
    const assetPath = toRelativeAssetPath(url);

    if (!referencedContextPaths.has(assetPath)) {
      addAsset(assetPath, 'context', null);
    }
  }

  const alternatives = (rawQuestion.alternatives ?? []).map((alternative) => {
    const alternativeText = rewriteMarkdownImages(
      alternative.textMarkdown ?? alternative.text ?? null,
    );
    const assetIds = [];

    for (const assetPath of alternativeText.paths) {
      assetIds.push(addAsset(assetPath, 'alternative', alternative.letter));
    }

    if (alternative.file) {
      assetIds.push(
        addAsset(toRelativeAssetPath(alternative.file), 'alternative', alternative.letter),
      );
    }

    for (const assetId of alternative.assetIds ?? []) {
      const existingAsset = existingAssetsById.get(assetId);

      if (existingAsset && !assetIds.includes(assetId)) {
        assetIds.push(
          addAsset(
            toRelativeAssetPath(existingAsset.path),
            existingAsset.role,
            existingAsset.alternativeLetter,
          ),
        );
      }
    }

    return {
      id: `${questionId}:${alternative.letter}`,
      letter: alternative.letter,
      textMarkdown: alternativeText.markdown,
      assetIds,
      isCorrect: alternative.isCorrect,
    };
  });

  return {
    id: questionId,
    variantKey,
    title: rawQuestion.title,
    index: rawQuestion.index,
    year: rawQuestion.year ?? year,
    discipline: rawQuestion.discipline,
    language: rawQuestion.language,
    contextMarkdown: context.markdown,
    alternativesIntroductionMarkdown: alternativesIntroduction.markdown,
    assets,
    correctAlternative: rawQuestion.correctAlternative,
    alternatives,
  };
}

export function getAssetFilePath(publicDirectory, assetPath) {
  const filePath = path.resolve(publicDirectory, `.${assetPath}`);
  const publicRoot = path.resolve(publicDirectory);

  if (filePath !== publicRoot && !filePath.startsWith(`${publicRoot}${path.sep}`)) {
    throw new Error(`Asset path escapes public directory: ${assetPath}`);
  }

  return filePath;
}

function assert(condition, message, errors) {
  if (!condition) {
    errors.push(message);
  }
}

function countAssetsByPath(assets) {
  return assets.reduce((counts, asset) => {
    counts.set(asset.path, (counts.get(asset.path) ?? 0) + 1);
    return counts;
  }, new Map());
}

function countMarkdownImagePaths(value, relativePath, fieldName, errors) {
  const paths = new Map();

  if (value === null || value === undefined) {
    return paths;
  }

  if (typeof value !== 'string') {
    errors.push(`${relativePath}: ${fieldName} must be a string or null`);
    return paths;
  }

  for (const match of value.matchAll(MARKDOWN_IMAGE_REGEX)) {
    const assetPath = match[2];

    if (!assetPath.startsWith('/')) {
      errors.push(
        `${relativePath}: ${fieldName} contains non-relative image ${assetPath}`,
      );
      continue;
    }

    paths.set(assetPath, (paths.get(assetPath) ?? 0) + 1);
  }

  return paths;
}

function assertMarkdownImagesHaveAssets({
  assetCountsByPath,
  errors,
  fieldName,
  markdownImageCountsByPath,
  relativePath,
}) {
  for (const [assetPath, count] of markdownImageCountsByPath) {
    assert(
      (assetCountsByPath.get(assetPath) ?? 0) >= count,
      `${relativePath}: ${fieldName} image ${assetPath} is not indexed in assets`,
      errors,
    );
  }
}

export function validateQuestionDetails(question, filePath, publicDirectory) {
  const errors = [];
  const { variantKey, year } = getQuestionPathParts(filePath);
  const relativePath = path.relative(publicDirectory, filePath);
  const expectedQuestionId = `${year}:${variantKey}`;
  const assetsById = new Map();

  assert(question.id === expectedQuestionId, `${relativePath}: invalid id`, errors);
  assert(
    question.variantKey === variantKey,
    `${relativePath}: invalid variantKey`,
    errors,
  );
  assert(question.year === year, `${relativePath}: invalid year`, errors);
  assert(
    ENEM_DISCIPLINES.includes(question.discipline),
    `${relativePath}: invalid discipline`,
    errors,
  );
  assert(
    question.language === null || ENEM_LANGUAGES.includes(question.language),
    `${relativePath}: invalid language`,
    errors,
  );
  assert(!('files' in question), `${relativePath}: legacy files field`, errors);
  assert(
    Array.isArray(question.assets),
    `${relativePath}: assets must be an array`,
    errors,
  );

  for (const [assetIndex, asset] of (question.assets ?? []).entries()) {
    assert(
      asset.id === `${question.id}:asset:${assetIndex}`,
      `${relativePath}: invalid asset id at ${assetIndex}`,
      errors,
    );
    assert(
      typeof asset.path === 'string' && asset.path.startsWith('/'),
      `${relativePath}: invalid asset path at ${assetIndex}`,
      errors,
    );
    assert(
      asset.role === 'context' || asset.role === 'alternative',
      `${relativePath}: invalid asset role at ${assetIndex}`,
      errors,
    );
    assert(
      asset.position === assetIndex,
      `${relativePath}: invalid asset position at ${assetIndex}`,
      errors,
    );
    assert(
      asset.alternativeLetter === null ||
        ENEM_ALTERNATIVE_LETTERS.includes(asset.alternativeLetter),
      `${relativePath}: invalid asset alternative letter at ${assetIndex}`,
      errors,
    );
    assert(
      existsSync(getAssetFilePath(publicDirectory, asset.path)),
      `${relativePath}: missing asset ${asset.path}`,
      errors,
    );
    assert(
      !assetsById.has(asset.id),
      `${relativePath}: duplicate asset id ${asset.id}`,
      errors,
    );

    assetsById.set(asset.id, asset);
  }

  const correctAlternatives = [];
  const contextAssetCountsByPath = countAssetsByPath(
    (question.assets ?? []).filter((asset) => asset.role === 'context'),
  );

  assertMarkdownImagesHaveAssets({
    assetCountsByPath: contextAssetCountsByPath,
    errors,
    fieldName: 'contextMarkdown',
    markdownImageCountsByPath: countMarkdownImagePaths(
      question.contextMarkdown,
      relativePath,
      'contextMarkdown',
      errors,
    ),
    relativePath,
  });
  assertMarkdownImagesHaveAssets({
    assetCountsByPath: contextAssetCountsByPath,
    errors,
    fieldName: 'alternativesIntroductionMarkdown',
    markdownImageCountsByPath: countMarkdownImagePaths(
      question.alternativesIntroductionMarkdown,
      relativePath,
      'alternativesIntroductionMarkdown',
      errors,
    ),
    relativePath,
  });

  for (const [alternativeIndex, alternative] of (question.alternatives ?? []).entries()) {
    assert(
      alternative.id === `${question.id}:${alternative.letter}`,
      `${relativePath}: invalid alternative id at ${alternativeIndex}`,
      errors,
    );
    assert(
      ENEM_ALTERNATIVE_LETTERS.includes(alternative.letter),
      `${relativePath}: invalid alternative letter at ${alternativeIndex}`,
      errors,
    );
    assert(
      !('file' in alternative),
      `${relativePath}: legacy alternative file field at ${alternative.letter}`,
      errors,
    );
    assert(
      Array.isArray(alternative.assetIds),
      `${relativePath}: alternative assetIds must be an array at ${alternative.letter}`,
      errors,
    );
    assert(
      alternative.textMarkdown !== null || alternative.assetIds.length > 0,
      `${relativePath}: alternative ${alternative.letter} has no text or asset`,
      errors,
    );

    for (const assetId of alternative.assetIds ?? []) {
      const asset = assetsById.get(assetId);

      assert(
        Boolean(asset),
        `${relativePath}: alternative ${alternative.letter} references missing asset ${assetId}`,
        errors,
      );
      assert(
        !asset || asset.alternativeLetter === alternative.letter,
        `${relativePath}: alternative ${alternative.letter} references asset for ${asset?.alternativeLetter}`,
        errors,
      );
    }

    assertMarkdownImagesHaveAssets({
      assetCountsByPath: countAssetsByPath(
        (alternative.assetIds ?? [])
          .map((assetId) => assetsById.get(assetId))
          .filter(Boolean),
      ),
      errors,
      fieldName: `alternative ${alternative.letter} textMarkdown`,
      markdownImageCountsByPath: countMarkdownImagePaths(
        alternative.textMarkdown,
        relativePath,
        `alternative ${alternative.letter} textMarkdown`,
        errors,
      ),
      relativePath,
    });

    if (alternative.isCorrect) {
      correctAlternatives.push(alternative.letter);
    }
  }

  assert(
    correctAlternatives.length === 1,
    `${relativePath}: expected exactly one correct alternative`,
    errors,
  );
  assert(
    correctAlternatives[0] === question.correctAlternative,
    `${relativePath}: correctAlternative mismatch`,
    errors,
  );

  return errors;
}
