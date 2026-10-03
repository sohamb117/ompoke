import { test, expect } from 'bun:test';
import { animations, resolveAnimation, sampleDurations, compilePack, states } from '../server/pack';
import { findEntry } from '../server/catalog';
import { unzipSync, strFromU8 } from 'fflate';
import sharp from 'sharp';
test('catalog identifiers cannot become arbitrary source paths',()=>{expect(()=>findEntry('../0570')).toThrow();expect(()=>findEntry('https://example.com')).toThrow();expect(findEntry('0570').species).toBe('Zorua');});
test('aliases resolve and cycles are rejected',()=>{const all=animations('<AnimData><Anims><Anim><Name>Idle</Name><CopyOf>Walk</CopyOf></Anim><Anim><Name>Walk</Name><FrameWidth>32</FrameWidth></Anim></Anims></AnimData>');expect(resolveAnimation(all,'Idle').Name).toBe('Walk');expect(()=>resolveAnimation(new Map([['Idle',{Name:'Idle',CopyOf:'Idle'}]]),'Idle')).toThrow('Circular');});
test('frame sampling stays bounded and retains full cycle timing',()=>{const result=sampleDurations(Array(32).fill(6));expect(result.length).toBe(16);expect(result.at(-1)?.index).toBe(30);expect(result.reduce((s,x)=>s+x.duration_ms,0)).toBe(3200);expect(sampleDurations([1,300]).map(x=>x.duration_ms)).toEqual([80,2000]);expect(()=>sampleDurations([NaN])).toThrow();});
test('real Zorua pack includes credits, sleep and native-compatible crops',async()=>{
  const pack=await compilePack('0570',1),files=unzipSync(pack.zip);
  expect(pack.mapping.sleep).toBe('Sleep');expect(pack.sha256.length).toBe(64);
  expect(strFromU8(files['CREDITS.md'])).toContain('Sprite artists:');
  expect(files['upstream-credits.txt'].length).toBeGreaterThan(10);
  const manifest=JSON.parse(strFromU8(files['manifest.json']));let totalFrames=0,pixels=0,pngBytes=0;
  const meta=new Map<string,sharp.Metadata>();
  for(const [name,bytes] of Object.entries(files))if(name.endsWith('.png')) {const m=await sharp(bytes).metadata();meta.set(name,m);pixels+=m.width!*m.height!;pngBytes+=bytes.length;expect(m.width!).toBeLessThanOrEqual(2048);expect(m.height!).toBeLessThanOrEqual(2048);}
  for(const state of states) {expect(manifest[state].length).toBeGreaterThan(0);for(const f of manifest[state]) {totalFrames++;const m=meta.get(f.file)!;expect(f.x+f.width).toBeLessThanOrEqual(m.width!);expect(f.y+f.height).toBeLessThanOrEqual(m.height!);expect(f.duration_ms).toBeGreaterThanOrEqual(80);expect(f.duration_ms).toBeLessThanOrEqual(2000);}}
  expect(totalFrames).toBeLessThanOrEqual(128);expect(pixels).toBeLessThanOrEqual(4_000_000);expect(pngBytes).toBeLessThanOrEqual(16*1024*1024);expect(files['manifest.json'].length).toBeLessThanOrEqual(65536);
  expect((await compilePack('0570',1)).sha256).toBe(pack.sha256);
},60000);
test('one-row sleep sheets and alternate forms support all facing choices',async()=>{for(const id of ['0025','0133','0570-0001','0570-0000-0001']) {const p=await compilePack(id,7);expect(p.manifest.idle.length).toBeGreaterThan(0);expect(p.manifest.sleep.length).toBeGreaterThan(0);}},120000);
