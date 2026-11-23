import { readFileSync } from 'node:fs';
import { screen } from './screen.mjs';
const ORDER=['CLEAR','INVENTORY_UPDATE','NEEDS_INFO','REVIEW_REQUIRED','DPIA_LIKELY'];
for (const f of ['tickets','heldout']) {
  const {tickets}=JSON.parse(readFileSync(new URL(`../dataset/${f}.json`, import.meta.url),'utf8'));
  let flagTP=0,flagFP=0,flagFN=0, out=[];
  for (const t of tickets){ const r=screen(t,undefined,{failSafe:true}); const g=t.gold.outcome!=='CLEAR', p=r.outcome!=='CLEAR';
    if(g&&p)flagTP++; else if(!g&&p)flagFP++; else if(g&&!p)flagFN++; out.push(`${t.id}:${t.gold.outcome}->${r.outcome}`);}
  console.log(f, {flagTP,flagFP,flagFN, flagRecall:(flagTP/(flagTP+flagFN)).toFixed(3), flagPrecision:(flagTP/(flagTP+flagFP)).toFixed(3)}); console.log(out.join('  '));
}
