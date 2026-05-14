#!/usr/bin/env node
import {
  findQuestionDetailFiles,
  getPublicDirectory,
  normalizeQuestionDetails,
  readJsonFile,
  stableJson,
  writeJsonFile,
} from './public-data-utils.mjs';

const args = new Set(process.argv.slice(2));
const shouldWrite = args.has('--write');
const shouldCheck = args.has('--check') || !shouldWrite;
const publicDirectory = getPublicDirectory();
const changedFiles = [];

for (const filePath of findQuestionDetailFiles(publicDirectory)) {
  const original = readJsonFile(filePath);
  const normalized = normalizeQuestionDetails(original, filePath);

  if (stableJson(original) !== stableJson(normalized)) {
    changedFiles.push(filePath);

    if (shouldWrite) {
      writeJsonFile(filePath, normalized);
    }
  }
}

if (changedFiles.length > 0) {
  const verb = shouldWrite ? 'Normalized' : 'Would normalize';
  console.info(`${verb} ${changedFiles.length} question files.`);

  if (shouldCheck) {
    for (const filePath of changedFiles.slice(0, 20)) {
      console.info(`- ${filePath}`);
    }

    if (changedFiles.length > 20) {
      console.info(`...and ${changedFiles.length - 20} more`);
    }

    process.exitCode = 1;
  }
} else {
  console.info('Public ENEM question data is already normalized.');
}
