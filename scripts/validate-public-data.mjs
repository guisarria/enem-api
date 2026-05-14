#!/usr/bin/env node
import {
  findQuestionDetailFiles,
  getPublicDirectory,
  readJsonFile,
  validateQuestionDetails,
} from './public-data-utils.mjs';

const publicDirectory = getPublicDirectory();
const errors = [];
const files = findQuestionDetailFiles(publicDirectory);
let alternativesCount = 0;
let assetsCount = 0;

for (const filePath of files) {
  const question = readJsonFile(filePath);

  alternativesCount += question.alternatives?.length ?? 0;
  assetsCount += question.assets?.length ?? 0;
  errors.push(...validateQuestionDetails(question, filePath, publicDirectory));
}

if (errors.length > 0) {
  console.error(`Public ENEM data validation failed with ${errors.length} error(s).`);

  for (const error of errors.slice(0, 50)) {
    console.error(`- ${error}`);
  }

  if (errors.length > 50) {
    console.error(`...and ${errors.length - 50} more`);
  }

  process.exit(1);
}

console.info(
  JSON.stringify(
    {
      status: 'ok',
      questions: files.length,
      alternatives: alternativesCount,
      assets: assetsCount,
    },
    null,
    2,
  ),
);
