import { loadZip } from './loadZip';
import { scanArchiveEntry } from './archiveReading';
import type { DeviceLoadProfile } from './modelLoading';
function packagePath(value: string): void {
    let decoded: string;
    try {
        decoded = decodeURIComponent(value);
    }
    catch {
        throw new Error('The model package contains an invalid resource path.');
    }
    if (!decoded || decoded.length > 4096 || /[\\:&\u0000-\u0020]/.test(decoded) || decoded.startsWith('//') || decoded.split('/').includes('..')) {
        throw new Error('Protected models must contain their resources inside the file. External or unsafe resource paths are not supported.');
    }
}
/** Inspect a 3MF with bounded streaming inflation before handing it to the viewer. */
export async function validate3mfPackage(file: Blob, profile: DeviceLoadProfile, signal?: AbortSignal): Promise<void> {
    const zip = await (await loadZip()).loadAsync(await file.arrayBuffer());
    const entries = Object.values(zip.files).filter((entry: any) => !entry.dir) as any[];
    if (!entries.length || entries.length > 1024 || !entries.some(entry => /\.model$/i.test(entry.name)))
        throw new Error('Invalid or oversized 3MF package.');
    const limit = Math.min(profile.hardLimitBytes, (profile.name === 'standard' ? 200 : profile.name === 'conservative' ? 96 : profile.name === 'mobile-safe' ? 64 : 32) * 1024 * 1024);
    let declared = 0;
    for (const entry of entries) {
        signal?.throwIfAborted();
        packagePath(entry.unsafeOriginalName ?? entry.name);
        declared += Number(entry._data?.uncompressedSize) || 0;
        if (declared > limit)
            throw new Error('Expanded 3MF exceeds this device’s safe loading limit. Use a smaller model or a desktop browser.');
        const xml = /\.(?:model|xml|rels)$/i.test(entry.name);
        const decoder = new TextDecoder('utf-8', { fatal: true });
        let tail = '';
        await scanArchiveEntry(zip, entry, limit, chunk => {
            signal?.throwIfAborted();
            if (!xml)
                return;
            const text = tail + decoder.decode(chunk, { stream: true });
            if (/<!DOCTYPE|<!ENTITY|TargetMode\s*=\s*["']External["']/i.test(text))
                throw new Error('External references and XML entities are not supported in protected 3MF files.');
            if (/encoding\s*=\s*["'](?!utf-?8["']|us-ascii["'])/i.test(text))
                throw new Error('Protected 3MF XML must use UTF-8 encoding.');
            for (const match of text.matchAll(/(?:\bpath|\bTarget)\s*=\s*["']([^"']*)["']/gi))
                packagePath(match[1]);
            for (const match of text.matchAll(/(?:\bpath|\bTarget)\s*=\s*(["'])/gi)) {
                const rest = text.slice(match.index! + match[0].length);
                if (!rest.includes(match[1]) && rest.length > 4096)
                    throw new Error('The 3MF resource path exceeds the safe length limit.');
            }
            tail = text.slice(-8192);
        });
        if (xml)
            decoder.decode();
    }
}
/** Binary GLTF may still refer to URLs; protected loading requires embedded data. */
export async function validateGlbPackage(file: Blob, profile: DeviceLoadProfile): Promise<void> {
    const header = new DataView(await file.slice(0, 20).arrayBuffer());
    if (header.byteLength < 20 || header.getUint32(0, true) !== 0x46546c67 || header.getUint32(4, true) !== 2
        || header.getUint32(8, true) !== file.size || header.getUint32(16, true) !== 0x4e4f534a)
        throw new Error('Invalid GLB container.');
    const length = header.getUint32(12, true);
    if (length > Math.min(profile.softLimitBytes, 8 * 1024 * 1024) || length + 20 > file.size)
        throw new Error('The GLB metadata exceeds the safe loading limit.');
    const json = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await file.slice(20, 20 + length).arrayBuffer()));
    if (!Array.isArray(json.buffers ?? []) || !Array.isArray(json.images ?? []))
        throw new Error('Invalid GLB resources.');
    for (const buffer of json.buffers ?? [])
        if (buffer.uri !== undefined)
            throw new Error('Protected GLB buffers must be embedded in the binary container.');
    for (const image of json.images ?? [])
        if (image.uri !== undefined)
            throw new Error('Protected GLB textures must use embedded buffer views.');
}
