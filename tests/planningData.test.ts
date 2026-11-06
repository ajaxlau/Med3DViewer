import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSharedWorkspace, normalizeSlicerCoordinateSystem, validateSlicerMarkups, validateEmbeddedPlanningAsset, validatePlanningMetadata, validatePlanningArchiveEntries, transformedDistance, transformedAngle } from '../src/lib/planningData';

const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const point = (x = 0, y = 0, z = 0) => ({ x, y, z });
function snapshot(objects: any[] = []) {
  return { schemaVersion: 1, modelMatrix: [...identity], coordinateSystem: { systemType: 'Viewer world with recorded model root', units: 'millimeters (mm)' }, objects, groups: [] };
}
const measurement = () => ({ id: 'Measurement_1', name: '10 mm', type: 'measurement', p1: point(), p2Coord: point(10), meshMatrix: [...identity], color: '#10b981', opacity: 0, visible: false });

test('bounded metadata-only workspace preserves precise coordinates, zero opacity and transforms', () => {
  const data = measurement(); data.p2Coord.x = 10.000000123;
  data.meshMatrix[12] = 123.456; // Translation is state, not mesh vertex data.
  const result = validateSharedWorkspace(snapshot([data]));
  assert.equal(result.objects[0].p2Coord.x, 10.000000123);
  assert.equal(result.objects[0].meshMatrix[12], 123.456);
  assert.equal(result.objects[0].opacity, 0);
  assert.equal(result.objects[0].visible, false);
  assert.deepEqual(validateSharedWorkspace(snapshot()).objects, []);
});

test('workspace rejects hidden model bytes, external references, custom meshes and malformed geometry', () => {
  for (const extra of [{ fileDataURL: 'data:application/octet-stream;base64,AAAA' }, { sourceUrl: 'https://example.test/model.stl' }, { geometry: { vertices: [] } }]) {
    assert.throws(() => validateSharedWorkspace(snapshot([{ ...measurement(), ...extra }])));
  }
  assert.throws(() => validateSharedWorkspace(snapshot([{ ...measurement(), type: 'custom_model' }])));
  assert.throws(() => validateSharedWorkspace(snapshot([{ ...measurement(), p1: point(Infinity) }])));
  assert.throws(() => validateSharedWorkspace(snapshot([{ ...measurement(), color: '#fff;url(https://example.test)' }])));
  assert.throws(() => validateSharedWorkspace(snapshot([{ ...measurement(), groupId: 'missing' }])));
  assert.throws(() => validateSharedWorkspace(snapshot([measurement(), measurement()])));
});

test('large control-point sets and malicious object keys cannot enter the share snapshot', () => {
  assert.throws(() => validateSharedWorkspace(snapshot([{ id: 'curve', name: 'curve', type: 'curve', meshMatrix: identity, thickness: 0.2, points: Array.from({ length: 2049 }, () => point()) }])));
  const data = JSON.parse(JSON.stringify(snapshot()));
  data.__proto__ = { hacked: true };
  assert.throws(() => validateSharedWorkspace(data));
  assert.throws(() => validateSharedWorkspace({ ...snapshot(), workspaceUrl: 'https://example.test' }));
});

test('Slicer RAS enum zero is not accidentally treated as default LPS', () => {
  assert.equal(normalizeSlicerCoordinateSystem(0), 'RAS');
  assert.equal(normalizeSlicerCoordinateSystem(1), 'LPS');
  assert.equal(normalizeSlicerCoordinateSystem('ras'), 'RAS');
  assert.equal(normalizeSlicerCoordinateSystem(undefined), 'LPS');
  for (const value of [2, false, {}, 'IJK']) assert.throws(() => normalizeSlicerCoordinateSystem(value));
});

test('native Slicer data validates numeric systems and rejects unsupported units/nonfinite positions', () => {
  const base = { type: 'Angle', coordinateSystem: 0, coordinateUnits: 'mm', controlPoints: [{ position: [10, 0, 0] }, { position: [0, 0, 0] }, { position: [0, 10, 0] }] };
  assert.doesNotThrow(() => validateSlicerMarkups({ markups: [base] }));
  assert.throws(() => validateSlicerMarkups({ markups: [{ ...base, coordinateUnits: 'cm' }] }), /millimeter/);
  assert.throws(() => validateSlicerMarkups({ markups: [{ ...base, controlPoints: [{ position: [NaN, 1, 2] }] }] }));
  assert.throws(() => validateSlicerMarkups({ markups: [{ ...base, orientation: [1, 0] }] }));
});

test('planning metadata cannot fetch external assets; archive limits reject unsafe expansion and duplicate names', () => {
  Object.defineProperty(globalThis, 'window', { value: { location: { origin: 'https://viewer.test' } }, configurable: true });
  assert.equal(validateEmbeddedPlanningAsset('data:application/octet-stream;base64,AAAA', 10), 'data:application/octet-stream;base64,AAAA');
  for (const url of ['https://example.test/private.stl', 'data:text/html;base64,AAAA', 'blob:https://other.test/random']) assert.throws(() => validateEmbeddedPlanningAsset(url, 100));
  assert.throws(() => validatePlanningMetadata({ objects: [{ id: 'c', name: 'c', type: 'custom_model', fileDataURL: 'https://example.test/private.stl' }] }, 100));
  assert.throws(() => validateEmbeddedPlanningAsset('data:application/octet-stream;base64,AAAA', 1));
  const entry = (name: string, size: number) => ({ name, _data: { uncompressedSize: size } });
  assert.doesNotThrow(() => validatePlanningArchiveEntries({ a: entry('metadata.json', 20), b: entry('mesh.stl', 30) }, 100));
  assert.throws(() => validatePlanningArchiveEntries({ a: entry('big.stl', 101) }, 100));
  assert.throws(() => validatePlanningArchiveEntries({ a: entry('../private.stl', 20) }, 100));
  assert.throws(() => validatePlanningArchiveEntries({ a: entry('a/mesh.stl', 20), b: entry('b/mesh.stl', 20) }, 100));
});


test('analytic measurements use transformed geometry, including nonuniform scales and translations', () => {
  const scaled = [...identity]; scaled[0] = 2; scaled[5] = 3; scaled[12] = 120;
  assert.equal(transformedDistance(10, scaled), 30);
  assert.equal(transformedAngle(point(10), point(), point(0, 10), scaled), 90);
  const angle = transformedAngle(point(1, 1), point(), point(1, 0), scaled);
  assert.ok(Math.abs(angle - Math.atan2(3, 2) * 180 / Math.PI) < 1e-10);
  assert.throws(() => transformedAngle(point(), point(), point(1), identity), /distinct/);
});
