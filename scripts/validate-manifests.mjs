import { readFile } from 'node:fs/promises';

const manifestNames = ['package.json', 'package-lock.json'];
const manifests = new Map();

for (const filename of manifestNames) {
  let source;
  try {
    source = await readFile(new URL(`../${filename}`, import.meta.url), 'utf8');
  } catch (error) {
    console.error(`Unable to read ${filename}: ${error.message}`);
    process.exitCode = 1;
    continue;
  }

  try {
    manifests.set(filename, JSON.parse(source));
  } catch (error) {
    console.error(`${filename} is not valid JSON: ${error.message}`);
    process.exitCode = 1;
  }
}

if (process.exitCode) {
  process.exit();
}

const packageJson = manifests.get('package.json');
const packageLock = manifests.get('package-lock.json');
const lockedRoot = packageLock?.packages?.[''];

if (!lockedRoot) {
  console.error('package-lock.json does not contain a root package entry.');
  process.exit(1);
}

for (const section of ['dependencies', 'devDependencies']) {
  const expected = packageJson[section] ?? {};
  const locked = lockedRoot[section] ?? {};

  for (const [name, range] of Object.entries(expected)) {
    if (locked[name] !== range) {
      console.error(
        `package-lock.json is out of sync: ${section}.${name} is ${JSON.stringify(locked[name])}, expected ${JSON.stringify(range)}.`,
      );
      process.exitCode = 1;
    }
  }

  for (const name of Object.keys(locked)) {
    if (!(name in expected)) {
      console.error(`package-lock.json has stale root entry: ${section}.${name}.`);
      process.exitCode = 1;
    }
  }
}

if (!process.exitCode) {
  console.log('package.json and package-lock.json are valid and synchronized.');
}
