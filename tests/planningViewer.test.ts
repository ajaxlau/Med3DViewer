import test from 'node:test';
import assert from 'node:assert/strict';
import { ViewerManager } from '../src/lib/ViewerManager';

class TextNode {
  children: TextNode[] = [];
  style: Record<string, any> = {};
  className = ''; textContent = '';
  classList = { remove() {}, add() {} };
  append(...nodes: TextNode[]) { this.children.push(...nodes); }
  appendChild(node: TextNode) { this.children.push(node); }
  replaceChildren() { this.children = []; }
  set innerHTML(_value: string) { throw new Error('User content must never be interpreted as HTML.'); }
}

test('malicious annotation names/descriptions render as literal tooltip text with safe colors', () => {
  const tooltip = new TextNode();
  Object.defineProperty(globalThis, 'document', { value: { createElement: () => new TextNode() }, configurable: true });
  Object.defineProperty(globalThis, 'requestAnimationFrame', { value: () => 1, configurable: true });
  const manager: any = Object.create(ViewerManager.prototype);
  manager.container = {};
  manager.ensureCardTooltipElement = () => tooltip;
  manager.updateCardTooltipPosition = () => {};
  const hostile = '<img src=x onerror="alert(1)">';
  manager.showCardTooltip({ id: 'pin', type: 'annotation', name: hostile, text: hostile, description: '<script>steal()</script>', color: 'red; background:url(https://attacker.test)' }, {});
  assert.equal(tooltip.children[0].children[0].textContent, hostile);
  assert.equal(tooltip.children[1].textContent, '<script>steal()</script>');
  assert.equal(tooltip.style.borderTop, '2.5px solid #0284c7');
});

test('resetting/replacing a model never removes saved workspace records for any model', () => {
  const records = new Map([['3dpo_planning_objects_A.stl', '["saved A"]'], ['3dpo_planning_groups_B.stl', '["saved B"]']]);
  Object.defineProperty(globalThis, 'localStorage', { value: { removeItem(key: string) { records.delete(key); } }, configurable: true });
  const manager: any = Object.create(ViewerManager.prototype);
  Object.assign(manager, { config: { onStatusChange() {} }, loadedFilename: 'A.stl', loadedModelIdentity: 'old', flyThroughState: { active: false }, originalColors: new Map(), ghostedOriginals: new Map(), viewer: null });
  for (const method of ['cancelModelLoad', 'clearRotationVisualCue', 'clearTranslationVisualCue', 'highlightPlanningMesh', 'clearAllPlanningObjects', 'clearPlanningPoints', 'notifyGroupsChanged', 'revertGhostingMode', 'clearHighlight', 'setAutoRotate']) manager[method] = () => {};
  manager.resetWorkspace(true);
  assert.equal(records.get('3dpo_planning_objects_A.stl'), '["saved A"]');
  assert.equal(records.get('3dpo_planning_groups_B.stl'), '["saved B"]');
  assert.equal(manager.loadedFilename, null);
  assert.equal(manager.loadedModelIdentity, null);
});

test('recipient snapshots cannot write into an owners filename-keyed local workspace', () => {
  let writes = 0;
  Object.defineProperty(globalThis, 'localStorage', { value: { setItem() { writes++; } }, configurable: true });
  const manager: any = Object.create(ViewerManager.prototype);
  Object.assign(manager, { loadedFilename: 'shared-model.stl', planningObjects: [], planningGroups: [], readOnlySharedWorkspace: true });
  manager.saveToLocalStorage();
  assert.equal(writes, 0);
});

test('remote identity corresponds to imported bytes and stale digest completions cannot import a model', async () => {
  Object.defineProperty(globalThis, 'window', { value: { location: { href: 'https://viewer.test/', protocol: 'https:' } }, configurable: true });
  const realFetch = globalThis.fetch;
  const originalCrypto = globalThis.crypto;
  const bytes = new Uint8Array(84); // Valid binary STL header with no triangle payload.
  let finishDigest: (value: ArrayBuffer) => void = () => {};
  let digestStarted: () => void = () => {};
  const started = new Promise<void>(resolve => { digestStarted = resolve; });
  Object.defineProperty(globalThis, 'crypto', { value: { randomUUID: () => 'test-load', subtle: { digest: (_algorithm: string, input: ArrayBuffer) => {
    assert.deepEqual(new Uint8Array(input), bytes);
    digestStarted(); return new Promise(resolve => { finishDigest = resolve; });
  } } }, configurable: true });
  globalThis.fetch = async () => new Response(bytes, { headers: { 'content-type': 'application/octet-stream' } });
  let imports = 0;
  const manager: any = Object.create(ViewerManager.prototype);
  Object.assign(manager, {
    config: { onStatusChange() {}, onProgressChange() {} }, forceSafeMode: true,
    modelLoadState: {}, viewer: { LoadModelFromFileList() { imports++; } },
    emitModelLoadState(value: any) { this.modelLoadState = { ...this.modelLoadState, ...value }; },
    resetWorkspace() { this.loadedModelIdentity = null; }, waitForModelAndBuildTree() {},
  });
  try {
    const loading = manager.loadUrl('https://models.test/source.stl');
    await started;
    manager.cancelModelLoad(true);
    finishDigest(new Uint8Array(32).buffer);
    await loading;
    assert.equal(imports, 0);
    assert.equal(manager.loadedModelIdentity, null);
    Object.defineProperty(globalThis, 'crypto', { value: { randomUUID: () => 'next-load', subtle: { digest: async (_algorithm: string, input: ArrayBuffer) => {
      assert.deepEqual(new Uint8Array(input), bytes);
      return new Uint8Array(32).fill(1).buffer;
    } } }, configurable: true });
    await manager.loadUrl('https://models.test/source.stl');
    assert.equal(imports, 1);
    assert.equal(manager.loadedModelIdentity, '01'.repeat(32));
  } finally {
    globalThis.fetch = realFetch;
    Object.defineProperty(globalThis, 'crypto', { value: originalCrypto, configurable: true });
  }
});

test('recorded procedural definitions retain original coordinates and exact matrix without mesh payloads', () => {
  const manager: any = Object.create(ViewerManager.prototype);
  const world = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 120, 30, 5, 1];
  const object = {
    id: 'Plane_1', name: 'Asymmetric plane', type: 'plane', color: '#00ff00', p1: { x: 1, y: 2, z: 3 }, p2: { x: 10, y: 2, z: 3 }, p3: { x: 1, y: 8, z: 3 }, extWidth: 3, extLength: 9, thickness: -2,
    mesh: { updateMatrixWorld() {}, matrixWorld: { toArray: () => world } },
    fileDataURL: 'must-not-survive', geometry: { vertices: [1, 2, 3] },
  };
  const result = manager.recordProceduralPlanningObject(object);
  assert.deepEqual(result.p1, { x: 1, y: 2, z: 3 });
  assert.deepEqual(result.meshMatrix, world);
  assert.equal(result.extLength, 9);
  assert.equal(result.thickness, -2);
  assert.equal(result.mesh, undefined);
  assert.equal(result.geometry, undefined);
  assert.equal(result.fileDataURL, undefined);
  assert.equal(manager.recordProceduralPlanningObject({ ...object, type: 'custom_model' }), undefined);
});

test('planning ZIP assigns stable unique asset filenames and omits redundant embedded STL data', async () => {
  const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  Object.defineProperty(globalThis, 'window', { value: { THREE: { Matrix4: class { toArray() { return identity; } } } }, configurable: true });
  Object.defineProperty(globalThis, 'document', { value: { createElement: () => ({ click() {} }) }, configurable: true });
  let archive: Blob | undefined;
  const oldURL = URL.createObjectURL;
  URL.createObjectURL = (value: Blob) => { archive = value; return 'blob:local-test'; };
  try {
    const manager: any = Object.create(ViewerManager.prototype);
    manager.planningObjects = ['CustomModel_1', 'CustomModel_2'].map(id => ({ id, name: 'Same friendly name', type: 'custom_model', fileDataURL: 'data:application/octet-stream;base64,AAAA' }));
    manager.planningGroups = []; manager.loadedFilename = 'reference.stl';
    manager.getModelRoot = () => null;
    manager.generateSTLString = () => 'solid synthetic\nendsolid synthetic\n';
    manager.generateSlicerMarkupsJson = () => '';
    await manager.exportAllPlanningObjectsZip();
    const { default: JSZip } = await import('jszip');
    const zip = await JSZip.loadAsync(await archive!.arrayBuffer());
    assert.ok(zip.file('CustomModel_1.stl'));
    assert.ok(zip.file('CustomModel_2.stl'));
    const metadata = JSON.parse(await zip.file('metadata.json')!.async('string'));
    assert.deepEqual(metadata.objects.map((item: any) => item.fileName), ['CustomModel_1.stl', 'CustomModel_2.stl']);
    assert.ok(metadata.objects.every((item: any) => item.fileDataURL === undefined));
  } finally { URL.createObjectURL = oldURL; }
});

test('local JSON export emits one Slicer-compatible document without generating STL copies or a ZIP',async()=>{
  const manager:any=Object.create(ViewerManager.prototype),downloads:any[]=[];
  const previousWindow=globalThis.window,previousDocument=globalThis.document,create=URL.createObjectURL;
  Object.defineProperty(globalThis,'window',{configurable:true,value:{THREE:{Matrix4:class{toArray(){return [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];}}}}});
  Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement(){const link:any={click(){downloads.push({name:link.download,url:link.href});}};return link;}}});
  let exported:Blob|undefined;
  URL.createObjectURL=(blob:Blob)=>{exported=blob;return'blob:synthetic';};
  Object.assign(manager,{planningObjects:[{id:'local-point',type:'custom',name:'Local object',fileDataURL:'must-not-be-embedded'}],planningGroups:[],getModelRoot:()=>null,recordProceduralPlanningObject:()=>undefined,
    generateSTLString(){throw new Error('JSON export must not allocate STL geometry');},
    generateSlicerMarkupsJson(_objects:any,_name:any,metadata:any){assert.equal(metadata.objects[0].fileDataURL,undefined);return JSON.stringify({markups:[],appMetaData:metadata});}});
  try{await manager.exportAllPlanningObjectsZip('json');assert.equal(downloads.length,1);assert.equal(downloads[0].name,'All_Planning.mrk.json');const data=JSON.parse(await exported!.text());assert.equal(data.appMetaData.objects[0].fileName,'local-point.stl');assert.equal(data.appMetaData.coordinateSystem.units,'millimeters (mm)');}
  finally{URL.createObjectURL=create;Object.defineProperty(globalThis,'window',{configurable:true,value:previousWindow});Object.defineProperty(globalThis,'document',{configurable:true,value:previousDocument});}
});
