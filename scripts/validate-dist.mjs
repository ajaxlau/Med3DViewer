import { access, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const outputDirectory = path.resolve('dist');
const requiredFiles = ['index.html', 'manifest.webmanifest', 'sw.js'];

async function requireFile(relativePath) {
  const filename = path.join(outputDirectory, relativePath);
  await access(filename);
  if ((await stat(filename)).size === 0) {
    throw new Error(`${relativePath} is empty.`);
  }
}

try {
  await Promise.all(requiredFiles.map(requireFile));

  const html = await readFile(path.join(outputDirectory, 'index.html'), 'utf8');
  const localReferences = [...html.matchAll(/(?:href|src)="([^"#]+)"/g)]
    .map(([, reference]) => reference)
    .filter((reference) => !/^(?:[a-z]+:|\/\/)/i.test(reference));

  for (const reference of localReferences) {
    const pathname = reference.split(/[?#]/, 1)[0].replace(/^\.\//, '');
    if (pathname) await requireFile(pathname);
  }

  const manifest = JSON.parse(
    await readFile(path.join(outputDirectory, 'manifest.webmanifest'), 'utf8'),
  );
  for (const icon of manifest.icons ?? []) {
    await requireFile(icon.src.replace(/^\.\//, ''));
  }

  console.log(
    `Cloudflare artifact is complete (${requiredFiles.length} required files, ${localReferences.length} local HTML references, ${(manifest.icons ?? []).length} manifest icons).`,
  );
} catch (error) {
  console.error(`Cloudflare artifact validation failed: ${error.message}`);
  process.exit(1);
}
