// Shared planning records contain procedural definitions, never model bytes.
export interface SharedPlanningWorkspace {
  schemaVersion: 1;
  coordinateSystem: { systemType: 'Viewer world with recorded model root'; units: 'millimeters (mm)' };
  modelMatrix: number[];
  objects: Record<string, any>[];
  groups: Record<string, any>[];
}

export const MAX_SHARED_WORKSPACE_BYTES = 256 * 1024;
const common = ['id', 'name', 'type', 'color', 'opacity', 'visible', 'groupId', 'meshMatrix'];
const fields: Record<string, string[]> = {
  plane: ['p1', 'p2', 'p3', 'extWidth', 'extLength', 'thickness'],
  cylinder: ['p1', 'p2', 'diameter', 'extension'],
  curve: ['points', 'thickness'],
  measurement: ['p1', 'p2Coord', 'angle', 'cardOffset'],
  angle: ['p1', 'p2Coord', 'p3', 'angle', 'cardOffset'],
  point: ['points', 'diameter'],
  annotation: ['position', 'normal', 'text', 'description', 'pinSize', 'cardOffset'],
};

function record(value: any, label: string): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error(`${label} must be an object.`);
  return value;
}
function keys(value: any, allowed: string[], label: string) {
  record(value, label);
  if (Object.keys(value).some(key => !allowed.includes(key))) throw new Error(`${label} contains unsupported fields or model data.`);
}
function finite(value: any, label: string, limit = 1e9): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > limit) throw new Error(`${label} must be a finite number within limits.`);
  return value;
}
function text(value: any, label: string, max = 512): string {
  if (typeof value !== 'string' || value.length > max) throw new Error(`${label} must be text of at most ${max} characters.`);
  return value;
}
function point(value: any, label: string) {
  keys(value, ['x', 'y', 'z'], label);
  return { x: finite(value.x, label), y: finite(value.y, label), z: finite(value.z, label) };
}
function matrix(value: any, label: string): number[] {
  if (!Array.isArray(value) || value.length !== 16) throw new Error(`${label} must contain 16 numbers.`);
  const result = value.map(n => finite(n, label));
  if (result[3] !== 0 || result[7] !== 0 || result[11] !== 0 || result[15] !== 1) throw new Error(`${label} must be an affine matrix.`);
  const determinant = result[0] * (result[5] * result[10] - result[9] * result[6]) - result[4] * (result[1] * result[10] - result[9] * result[2]) + result[8] * (result[1] * result[6] - result[5] * result[2]);
  if (Math.abs(determinant) < 1e-14) throw new Error(`${label} is singular.`);
  return result;
}
export function safePlanningColor(value: unknown, fallback = '#0284c7'): string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

function transformPoint(p: { x: number; y: number; z: number }, matrix: number[]) {
  return {
    x: matrix[0] * p.x + matrix[4] * p.y + matrix[8] * p.z + matrix[12],
    y: matrix[1] * p.x + matrix[5] * p.y + matrix[9] * p.z + matrix[13],
    z: matrix[2] * p.x + matrix[6] * p.y + matrix[10] * p.z + matrix[14],
  };
}
export function transformedDistance(baseLength: number, matrix: number[]): number {
  const a = transformPoint({ x: 0, y: -baseLength / 2, z: 0 }, matrix);
  const b = transformPoint({ x: 0, y: baseLength / 2, z: 0 }, matrix);
  return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
}
export function transformedAngle(p1: any, vertex: any, p3: any, matrix: number[]): number {
  const a = transformPoint(p1, matrix), b = transformPoint(vertex, matrix), c = transformPoint(p3, matrix);
  const u = [a.x - b.x, a.y - b.y, a.z - b.z], v = [c.x - b.x, c.y - b.y, c.z - b.z];
  const denominator = Math.hypot(...u) * Math.hypot(...v);
  if (!denominator) throw new Error('An angle requires three distinct points.');
  return Math.acos(Math.max(-1, Math.min(1, (u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / denominator))) * 180 / Math.PI;
}

export function validateSharedWorkspace(input: unknown): SharedPlanningWorkspace {
  const source = record(input, 'Workspace');
  keys(source, ['schemaVersion', 'coordinateSystem', 'modelMatrix', 'objects', 'groups'], 'Workspace');
  if (source.schemaVersion !== 1) throw new Error('Unsupported shared workspace version.');
  keys(source.coordinateSystem, ['systemType', 'units'], 'Coordinate system');
  if (source.coordinateSystem.systemType !== 'Viewer world with recorded model root'
    || source.coordinateSystem.units !== 'millimeters (mm)') throw new Error('Unsupported workspace coordinate system or units.');
  if (!Array.isArray(source.objects) || source.objects.length > 1000
    || !Array.isArray(source.groups) || source.groups.length > 100) throw new Error('Workspace object/group limits exceeded.');
  const groupIds = new Set<string>();
  const groups = source.groups.map(raw => {
    keys(raw, ['id', 'name', 'visible', 'collapsed'], 'Group');
    const group: Record<string, any> = { id: text(raw.id, 'Group ID', 128), name: text(raw.name, 'Group name') };
    if (!group.id || groupIds.has(group.id)) throw new Error('Group IDs must be unique.');
    groupIds.add(group.id);
    for (const flag of ['visible', 'collapsed']) if (raw[flag] !== undefined) {
      if (typeof raw[flag] !== 'boolean') throw new Error(`Group ${flag} must be boolean.`);
      group[flag] = raw[flag];
    }
    return group;
  });
  const objectIds = new Set<string>();
  let pointCount = 0;
  const objects = source.objects.map(raw => {
    record(raw, 'Planning object');
    if (!Object.hasOwn(fields, raw.type)) throw new Error('This workspace includes a custom/local model or unsupported planning object. Use the existing ZIP export instead.');
    keys(raw, [...common, ...fields[raw.type]], 'Planning object');
    const obj: Record<string, any> = {
      id: text(raw.id, 'Object ID', 128), name: text(raw.name, 'Object name'), type: raw.type,
      meshMatrix: matrix(raw.meshMatrix, 'Object matrix'),
    };
    if (!obj.id || objectIds.has(obj.id)) throw new Error('Object IDs must be unique.');
    objectIds.add(obj.id);
    if (raw.color !== undefined) {
      if (safePlanningColor(raw.color, '') === '') throw new Error('Planning colors must use six-digit hexadecimal values.');
      obj.color = raw.color;
    }
    if (raw.visible !== undefined) {
      if (typeof raw.visible !== 'boolean') throw new Error('Object visibility must be boolean.');
      obj.visible = raw.visible;
    }
    if (raw.groupId !== undefined && raw.groupId !== null) {
      obj.groupId = text(raw.groupId, 'Group reference', 128);
      if (!groupIds.has(obj.groupId)) throw new Error('Unknown planning group reference.');
    } else obj.groupId = null;
    if (raw.opacity !== undefined) {
      obj.opacity = finite(raw.opacity, 'Opacity', 1);
      if (obj.opacity < 0) throw new Error('Opacity must be between zero and one.');
    }
    for (const key of fields[raw.type]) {
      const value = raw[key];
      if (value === undefined) continue;
      if (['p1', 'p2', 'p3', 'p2Coord', 'position', 'normal'].includes(key)) {
        obj[key] = key === 'normal' && value === null ? null : point(value, key);
        pointCount++;
      } else if (key === 'points') {
        if (!Array.isArray(value) || value.length > 2048 || value.length < (raw.type === 'curve' ? 2 : 1)
          || (raw.type === 'point' && value.length !== 1)) throw new Error('Invalid or oversized control-point list.');
        pointCount += value.length;
        obj.points = value.map((p: any) => point(p, 'Control point'));
      } else if (key === 'cardOffset') {
        keys(value, ['x', 'y'], 'Card offset');
        obj.cardOffset = { x: finite(value.x, 'Card offset', 100000), y: finite(value.y, 'Card offset', 100000) };
      } else if (key === 'text' || key === 'description') obj[key] = text(value, key, key === 'text' ? 2000 : 8000);
      else {
        obj[key] = finite(value, key, key === 'angle' ? 360 : 1000000);
        if (key !== 'angle' && !(key === 'thickness' && raw.type === 'plane') && obj[key] < 0) throw new Error(`${key} cannot be negative.`);
      }
    }
    const required: Record<string, string[]> = { plane: ['p1', 'p2', 'p3'], cylinder: ['p1', 'p2', 'diameter'], curve: ['points', 'thickness'], measurement: ['p1', 'p2Coord'], angle: ['p1', 'p2Coord', 'p3'], point: ['points', 'diameter'], annotation: ['position', 'pinSize'] };
    if (required[raw.type].some(key => obj[key] === undefined)) throw new Error('Required planning definition is missing.');
    return obj;
  });
  if (pointCount > 4096) throw new Error('Workspace control-point limit exceeded.');
  const result: SharedPlanningWorkspace = {
    schemaVersion: 1, modelMatrix: matrix(source.modelMatrix, 'Model matrix'),
    coordinateSystem: { systemType: 'Viewer world with recorded model root', units: 'millimeters (mm)' }, objects, groups,
  };
  if (new TextEncoder().encode(JSON.stringify(result)).byteLength > MAX_SHARED_WORKSPACE_BYTES) throw new Error('Shared workspace exceeds the 256 KiB limit.');
  return result;
}

export function normalizeSlicerCoordinateSystem(value: unknown): 'LPS' | 'RAS' {
  if (value === undefined || value === null) return 'LPS';
  // vtkMRMLStorageNode: RAS=0, LPS=1. Do not use `value || fallback`: zero is valid.
  if (value === 0) return 'RAS';
  if (value === 1) return 'LPS';
  if (typeof value === 'string' && ['LPS', 'RAS'].includes(value.toUpperCase())) return value.toUpperCase() as 'LPS' | 'RAS';
  throw new Error('Unsupported Slicer coordinate system. Expected LPS or RAS.');
}

export function validateSlicerMarkups(input: any): void {
  const list = Array.isArray(input) ? input : input?.markups ?? [input];
  if (!Array.isArray(list) || list.length > 1000) throw new Error('Too many Slicer markups.');
  let count = 0;
  for (const item of list) {
    record(item, 'Slicer markup');
    if (!['Fiducial', 'Line', 'Curve', 'Angle', 'Plane', 'Markups'].includes(item.type)) throw new Error('Unsupported Slicer markup type.');
    normalizeSlicerCoordinateSystem(item.coordinateSystem ?? input.coordinateSystem);
    if (item.display?.color !== undefined && (!Array.isArray(item.display.color) || item.display.color.length !== 3 || item.display.color.some((n: any) => typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 1))) throw new Error('Invalid Slicer display color.');
    const units = item.coordinateUnits ?? input.coordinateUnits;
    if (units !== undefined && units !== 'mm') throw new Error('Only millimeter Slicer markups are supported.');
    if (item.name !== undefined) text(item.name, 'Markup name');
    if (!Array.isArray(item.controlPoints ?? [])) throw new Error('Invalid Slicer control points.');
    for (const cp of item.controlPoints ?? []) {
      if (cp.positionStatus !== undefined && cp.positionStatus !== 'defined') throw new Error('Slicer markup contains undefined control points.');
      if (!Array.isArray(cp.position) || cp.position.length !== 3) throw new Error('Invalid Slicer position.');
      cp.position.forEach((n: any) => finite(n, 'Slicer coordinate'));
      count++;
      if (cp.label !== undefined) text(cp.label, 'Slicer label');
      if (cp.description !== undefined) text(cp.description, 'Slicer description', 8000);
    }
    for (const [key, length] of [['center', 3], ['orientation', 9], ['size', 3]] as const) if (item[key] !== undefined) {
      if (!Array.isArray(item[key]) || item[key].length !== length) throw new Error(`Invalid Slicer ${key}.`);
      item[key].forEach((n: any) => finite(n, `Slicer ${key}`));
    }
  }
  if (count > 4096) throw new Error('Too many Slicer control points.');
}

// Workspace files may contain local binary data, never instructions to fetch an external URL.
export function validateEmbeddedPlanningAsset(url: unknown, maxBytes: number): string {
  if (typeof url !== 'string') throw new Error('Missing custom STL data.');
  if (url.startsWith('blob:')) {
    if (new URL(url).origin !== window.location.origin) throw new Error('Custom STL blob belongs to another origin.');
    return url;
  }
  const match = /^data:(?:application\/octet-stream|application\/sla|model\/(?:stl|x\.stl))?;base64,([a-z0-9+/]*={0,2})$/i.exec(url);
  if (!match || match[1].length * 3 / 4 > maxBytes) throw new Error('Custom STL must be bounded inline binary data or a local blob. External URLs in planning metadata are blocked.');
  return url;
}

export function validatePlanningMetadata(input: any, maxBytes: number): void {
  record(input, 'Planning metadata');
  if (!Array.isArray(input.objects) || input.objects.length > 1000) throw new Error('Invalid or oversized planning object list.');
  let pointCount = 0;
  for (const item of input.objects) {
    record(item, 'Planning object');
    if (typeof item.type !== 'string' || (!Object.hasOwn(fields, item.type) && item.type !== 'custom_model')) throw new Error('Unsupported planning object type.');
    for (const key of ['id', 'name', 'groupId', 'groupName', 'fileName']) if (item[key] !== undefined && item[key] !== null) text(item[key], key);
    for (const key of ['text', 'description']) if (item[key] !== undefined) text(item[key], key, key === 'text' ? 2000 : 8000);
    if (item.color !== undefined && safePlanningColor(item.color, '') === '') throw new Error('Invalid planning color.');
    if (item.opacity !== undefined && (finite(item.opacity, 'Opacity', 1) < 0)) throw new Error('Invalid opacity.');
    if (item.visible !== undefined && typeof item.visible !== 'boolean') throw new Error('Invalid visibility.');
    for (const key of ['p1', 'p2', 'p3', 'p2Coord', 'position', 'normal']) if (item[key] !== undefined && item[key] !== null) point(item[key], key);
    if (item.points !== undefined) {
      if (!Array.isArray(item.points) || item.points.length > 2048) throw new Error('Invalid planning point count.');
      item.points.forEach((p: any) => point(p, 'Planning point'));
      pointCount += item.points.length;
      if (pointCount > 4096) throw new Error('Too many planning control points.');
    }
    if (item.meshMatrix !== undefined) matrix(item.meshMatrix, 'Planning matrix');
    if (item.viewerDefinition !== undefined) {
      validateSharedWorkspace({
        schemaVersion: 1,
        coordinateSystem: { systemType: 'Viewer world with recorded model root', units: 'millimeters (mm)' },
        modelMatrix: item.viewerModelMatrix,
        objects: [{ ...record(item.viewerDefinition, 'Recorded definition'), groupId: null }], groups: [],
      });
    }
    for (const key of ['posX', 'posY', 'posZ', 'rotQx', 'rotQy', 'rotQz', 'rotQw', 'scaleX', 'scaleY', 'scaleZ', 'diameter', 'radius', 'extension', 'thickness', 'extWidth', 'extLength', 'angle', 'pinSize']) if (item[key] !== undefined) finite(item[key], key);
    if (item.cardOffset !== undefined) {
      keys(item.cardOffset, ['x', 'y'], 'Card offset');
      finite(item.cardOffset.x, 'Card offset', 100000); finite(item.cardOffset.y, 'Card offset', 100000);
    }
    if (item.type === 'custom_model' && item.fileDataURL) validateEmbeddedPlanningAsset(item.fileDataURL, maxBytes);
    const required: Record<string, string[]> = { plane: ['p1', 'p2', 'p3'], cylinder: ['p1', 'p2'], curve: ['points'], measurement: ['p1', 'p2Coord'], angle: ['p1', 'p2Coord', 'p3'], point: ['points'], annotation: ['position'] };
    if (required[item.type]?.some(key => item[key] == null)) throw new Error('Planning definition is missing required coordinates.');
    if (item.type === 'curve' && item.points.length < 2 || item.type === 'point' && item.points.length !== 1) throw new Error('Invalid planning control-point count.');
    for (const key of ['diameter', 'radius', 'pinSize']) if (item[key] !== undefined && item[key] <= 0) throw new Error(`${key} must be positive.`);
    for (const key of ['extension', 'thickness', 'extWidth', 'extLength']) if (item[key] !== undefined && !(key === 'thickness' && item.type === 'plane') && item[key] < 0) throw new Error(`${key} cannot be negative.`);
  }
}

export function validatePlanningArchiveEntries(entries: Record<string, any>, maxBytes: number): void {
  const files = Object.values(entries).filter((entry: any) => !entry.dir) as any[];
  if (files.length > 128) throw new Error('Too many planning archive entries.');
  let total = 0;
  const names = new Set<string>();
  for (const entry of files) {
    const original = entry.unsafeOriginalName || entry.name;
    if (typeof original !== 'string' || original.startsWith('/') || original.split(/[\\/]/).includes('..')) throw new Error('Unsafe planning archive path.');
    const name = original.split(/[\\/]/).at(-1).toLowerCase();
    if (names.has(name)) throw new Error('Ambiguous duplicate planning archive filename.');
    names.add(name);
    const size = entry._data?.uncompressedSize;
    if (!Number.isSafeInteger(size) || size < 0 || size > maxBytes) throw new Error('Invalid or oversized archive entry.');
    total += size;
    if (total > maxBytes) throw new Error('Expanded planning archive exceeds this device limit.');
  }
}
