import type { SharedMeshState } from './planningData';
/** Stable per-instance scene paths, checked against the verified source model. */
export function captureSharedMeshState(meshes: any[], root: any): SharedMeshState[] {
    return meshes.map(mesh => {
        const path: number[] = [];
        let node = mesh;
        while (node !== root) {
            const parent = node.parent;
            const index = parent?.children?.indexOf(node) ?? -1;
            if (index < 0 || path.length >= 128)
                throw new Error('The model mesh tree cannot be shared safely.');
            path.unshift(index);
            node = parent;
        }
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        const opacities = materials.filter(Boolean).map(material => material.opacity ?? 1);
        if (opacities.some(value => value !== opacities[0]))
            throw new Error('A mesh with mixed material opacity cannot be saved as a single mesh state.');
        return {
            key: path.length ? path.join('.') : 'root',
            vertices: mesh.geometry?.attributes?.position?.count ?? 0,
            indices: mesh.geometry?.index?.count ?? 0,
            visible: mesh.visible !== false,
            opacity: opacities[0] ?? 1,
        };
    });
}
export function matchSharedMeshState(saved: SharedMeshState[], current: SharedMeshState[]): void {
    if (saved.length !== current.length || saved.some((mesh, index) => mesh.key !== current[index].key || mesh.vertices !== current[index].vertices || mesh.indices !== current[index].indices)) {
        throw new Error('The model mesh layout differs from this workspace. Mesh visibility and planning data were not applied.');
    }
}
