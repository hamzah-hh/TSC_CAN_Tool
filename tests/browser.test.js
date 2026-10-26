const {chromium}=require('playwright');const http=require('http');const fs=require('fs');const os=require('os');const path=require('path');
// Test copy of the extension that also runs on localhost, 127.0.0.1 and guard.test
// (the shipped one runs on leadsquared.com, leadsquaredcdn.com and lsqportal.com only).
// The frame guard list gets localhost and 127.0.0.1, but NOT guard.test: the guard must block guard.test.
const ext=fs.mkdtempSync(path.join(os.tmpdir(),'can-ext-'));fs.cpSync(path.join(__dirname,'..','extension'),ext,{recursive:true});
{const mf=JSON.parse(fs.readFileSync(path.join(ext,'manifest.json')));
 const extra=['http://localhost/*','http://127.0.0.1/*','http://guard.test/*'];
 mf.content_scripts[0].matches.push(...extra);mf.web_accessible_resources[0].matches.push(...extra);
 fs.writeFileSync(path.join(ext,'manifest.json'),JSON.stringify(mf));
 const cj=path.join(ext,'content.js');let src=fs.readFileSync(cj,'utf8');
 const from="var GUARD_DOMAINS = ['leadsquared.com'];";
 if(!src.includes(from))throw new Error('guard list line not found in content.js');
 fs.writeFileSync(cj,src.replace(from,"var GUARD_DOMAINS = ['leadsquared.com', 'localhost', '127.0.0.1'];"));}
const shots=path.join(__dirname,'screens')+'/';fs.mkdirSync(shots,{recursive:true});
const handler=(q,r)=>{r.setHeader('content-type','text/html');const f=q.url.startsWith('/popup.html')?'popup.html':'page.html';r.end(fs.readFileSync(path.join(__dirname,f)))};
const srv=http.createServer(handler).listen(0);const srv2=http.createServer(handler).listen(0);
let fails=0;const ok=(c,m)=>{console.log(c?'PASS':'FAIL',m);if(!c)fails++};
(async()=>{
 const port=srv.address().port;
 const ctx=await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(),'can-')),{headless:false,args:['--headless=new','--host-resolver-rules=MAP guard.test 127.0.0.1',`--disable-extensions-except=${ext}`,`--load-extension=${ext}`]});
 const p=await ctx.newPage();await p.goto(`http://localhost:${port}/`);
 const ghost=()=>p.evaluate(()=>{const o=document.getElementById('can-ghost-overlay');return o&&o.style.display!=='none'?o.querySelector('.can-g').textContent:null});
 const type=async(sel,t)=>{await p.click(sel);await p.fill(sel,'');await p.keyboard.type(t,{delay:15});await p.waitForTimeout(150)};
 await p.click('#ta');await p.keyboard.type('x');await p.waitForTimeout(800);await p.fill('#ta','');
 await type('#rx','rin');ok(await ghost()==='ging','rx "rin" ghost = '+await ghost());
 await p.screenshot({path:shots+'input-rx.png'});
 await p.keyboard.press('Tab');await p.waitForTimeout(100);
 ok(await p.inputValue('#rx')==='Ringing','Tab accepted (note start gets a capital): '+await p.inputValue('#rx'));
 ok(await p.evaluate(()=>window.rv)==='Ringing','react-like state got value');
 ok(await p.evaluate(()=>log.some(l=>l==='rx-input:Ringing')),'input event fired on accept');
 await type('#ta','after the call op');ok((await ghost()||'').startsWith('ening customer'),'ta ghost: '+await ghost());
 await p.screenshot({path:shots+'textarea.png'});
 await p.keyboard.press('Tab');ok(await p.inputValue('#ta')==='After the call opening customer disconnected the call','ta Tab: '+await p.inputValue('#ta'));
 await type('#in','vo');ok(await ghost()==='ice mail','input ghost: '+await ghost());
 await p.screenshot({path:shots+'input.png'});
 await p.keyboard.press('Escape');ok(await ghost()===null,'Esc hides');
 await p.keyboard.type('i');await p.waitForTimeout(100);ok(await p.inputValue('#in')==='voi','typing after Esc ok');
 await p.fill('#in','');await type('#in','not int');
 await p.keyboard.press('Control+ArrowRight');await p.waitForTimeout(100);ok(await p.inputValue('#in')==='Not interested','Ctrl+Right: '+await p.inputValue('#in'));
 // Tab with no suggestion moves focus
 await type('#in','zzzz');await p.keyboard.press('Tab');ok(await p.evaluate(()=>document.activeElement.id)==='rx','Tab w/o suggestion moves focus');
 // multiline textarea
 await p.click('#ta2');await p.fill('#ta2','');
 await p.keyboard.type('ringing busy\ncall back after two days. not int',{delay:5});await p.waitForTimeout(200);
 ok((await ghost())==='erested','multiline ghost: '+await ghost());
 await p.screenshot({path:shots+'textarea-multiline.png'});
 // long, scrolled
 await p.fill('#ta2','');
 await p.keyboard.type('ring busy\nring busy\nring busy\nring busy\nring busy\nring busy\ncb arranged\nnot int',{delay:2});await p.waitForTimeout(200);
 ok((await ghost())==='erested','scrolled ghost: '+await ghost());
 console.log('scrollTop',await p.evaluate(()=>document.getElementById('ta2').scrollTop));
 await p.screenshot({path:shots+'textarea-scrolled.png'});
 // long input scrolled
 await p.fill('#in','');await p.keyboard.type('');await p.click('#in');
 await p.keyboard.type('customer is busy will call back later and ring busy not int',{delay:2});await p.waitForTimeout(200);
 console.log('long input ghost',await ghost());await p.screenshot({path:shots+'input-scrolled.png'});
 // popup toggle
 const sw=ctx.serviceWorkers()[0]||await ctx.waitForEvent('serviceworker');const id=sw.url().split('/')[2];
 const pp=await ctx.newPage();await pp.goto(`chrome-extension://${id}/popup.html`);await pp.waitForTimeout(500);
 console.log('popup stats:',await pp.textContent('#stats'));await pp.screenshot({path:shots+'popup.png'});
 await pp.evaluate(()=>new Promise(r=>chrome.storage.sync.set({enabled:false},r)));await p.bringToFront();await p.waitForTimeout(300);
 await type('#rx','rin');ok(await ghost()===null,'disabled -> no ghost');
 await pp.evaluate(()=>new Promise(r=>chrome.storage.sync.set({enabled:true},r)));await p.waitForTimeout(300);
 await type('#rx','rin');ok(await ghost()==='ging','re-enabled -> ghost');

 // ---------- auto-format ----------
 await p.bringToFront();
 const val=sel=>p.inputValue(sel);
 const fresh=async(sel,t,delay=15)=>{await p.click(sel);await p.fill(sel,'');await p.keyboard.type(t,{delay});await p.waitForTimeout(150)};
 await fresh('#rx','cx ');ok(await val('#rx')==='Customer ','format: "cx " -> '+JSON.stringify(await val('#rx')));
 ok(await p.evaluate(()=>window.rv)==='Customer ','react-like input got formatted value: '+await p.evaluate(()=>window.rv));
 ok(await p.evaluate(()=>log.some(l=>l==='rx-input:Customer ')),'input event carries formatted value');
 await p.keyboard.type('cb tomm ',{delay:15});await p.waitForTimeout(100);
 ok(await val('#rx')==='Customer call back tomorrow ','format: "cb tomm " after Customer -> '+JSON.stringify(await val('#rx')));
 await p.screenshot({path:shots+'format-live.png'});
 await fresh('#rx','cx ');await p.keyboard.press('Backspace');await p.waitForTimeout(100);
 ok(await val('#rx')==='cx','Backspace undoes: '+JSON.stringify(await val('#rx')));
 ok(await p.evaluate(()=>document.getElementById('rx').selectionStart)===2,'caret after original word');
 await p.keyboard.type(' ');await p.waitForTimeout(100);
 ok(await val('#rx')==='cx ','undone key is not formatted again in this field: '+JSON.stringify(await val('#rx')));
 await fresh('#ta','cx ');await p.keyboard.press('Backspace');await p.keyboard.type('x');await p.waitForTimeout(100);
 ok(await val('#ta')==='cxx','Backspace only undoes as next key: '+JSON.stringify(await val('#ta')));
 await fresh('#ta','sw off, hello');await p.waitForTimeout(100);
 ok((await val('#ta'))==='Switched off, hello','two-word key + comma: '+JSON.stringify(await val('#ta')));
 await fresh('#ta2','ok\nrnr ');ok((await val('#ta2'))==='OK\nRinging ','newline + capital: '+JSON.stringify(await val('#ta2')));
 // blur formats the whole note
 await fresh('#in','CX IS LOOKING AERO PLUS DESK');await p.click('#ta');await p.waitForTimeout(100);
 ok(await val('#in')==='Customer is looking AeroPlus desk','blur formats ALL CAPS: '+JSON.stringify(await val('#in')));
 await fresh('#in','');await p.evaluate(()=>{const e=document.getElementById('in');e.focus();});
 await p.keyboard.insertText('cx sais pls chk');await p.click('#ta');await p.waitForTimeout(100);
 ok(await val('#in')==='Customer says please check','blur formats pasted text: '+JSON.stringify(await val('#in')));
 // accept with Tab, then a space
 await fresh('#ta','i will chk on am');ok(await ghost()==='azon','ghost casing for "am": '+await ghost());
 await p.keyboard.press('Tab');await p.keyboard.type(' ',{delay:15});await p.waitForTimeout(100);
 ok(await val('#ta')==='I will check on Amazon ','Tab accept then space: '+JSON.stringify(await val('#ta')));
 await fresh('#in','sma');console.log('ghost "sma":',await ghost());
 ok((await ghost()||'').toLowerCase().startsWith('rt'),'ghost has suggestion for "sma"');
 await p.screenshot({path:shots+'format-ghost.png'});
 // switch off
 await pp.evaluate(()=>new Promise(r=>chrome.storage.sync.set({format:false},r)));await p.waitForTimeout(300);
 await fresh('#rx','cx ');ok(await val('#rx')==='cx ','format off: no change '+JSON.stringify(await val('#rx')));
 await fresh('#in','CX IS');await p.click('#ta');ok(await val('#in')==='CX IS','format off: no blur change');
 await pp.evaluate(()=>new Promise(r=>chrome.storage.sync.set({format:true},r)));await p.waitForTimeout(300);
 await fresh('#in','cx ');ok(await val('#in')==='Customer ','format on again');
 await pp.screenshot({path:shots+'popup.png'});

 // =====================================================================
 // Pop-up forms: modal, dialog, frames, shadow DOM, contenteditable, pop-up windows, frame guard
 // =====================================================================
 const port2=srv2.address().port;
 const O1=`http://localhost:${port}`,O2=`http://127.0.0.1:${port2}`,OG=`http://guard.test:${port}`;
 const helper=await ctx.newPage();
 const lastField=async()=>{await new Promise(r=>setTimeout(r,200));return sw.evaluate(()=>chrome.storage.local.get('lastField')).then(r=>r.lastField)};
 const overlayInfo=fr=>fr.evaluate(()=>{
  const find=root=>{const o=root.querySelector('#can-ghost-overlay');if(o)return o;for(const el of root.querySelectorAll('*'))if(el.shadowRoot){const r=find(el.shadowRoot);if(r)return r}return null};
  const o=find(document);if(!o)return null;const cs=getComputedStyle(o);if(cs.display==='none')return null;
  const g=o.querySelector('.can-g'),gr=g.getBoundingClientRect(),or=o.getBoundingClientRect();
  return{text:g.textContent,ghost:{l:gr.left,t:gr.top,w:gr.width,h:gr.height},ov:{l:or.left,t:or.top,w:or.width,h:or.height},z:cs.zIndex,pos:cs.position,parent:o.parentNode.nodeName,isLast:o.parentNode.lastElementChild===o,vis:cs.visibility,op:cs.opacity}});
 const greys=async(pg,rect)=>{const b64=(await pg.screenshot()).toString('base64');
  return helper.evaluate(async({b64,rect})=>{const img=new Image();img.src='data:image/png;base64,'+b64;await img.decode();
   const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const x=c.getContext('2d');x.drawImage(img,0,0);
   const d=x.getImageData(Math.max(0,Math.floor(rect.x)),Math.max(0,Math.floor(rect.y)),Math.max(1,Math.ceil(rect.w)),Math.max(1,Math.ceil(rect.h))).data;
   let n=0;for(let i=0;i<d.length;i+=4){const r=d[i],g=d[i+1],b=d[i+2];if(r>110&&r<228&&Math.abs(r-g)<16&&Math.abs(g-b)<22)n++}return n},{b64,rect})};
 const fval=(fr,sel)=>fr.locator(sel).evaluate(el=>(el.value!==undefined?el.value:el.textContent).replace(/ /g,' '));
 const fvalML=(fr,sel)=>fr.locator(sel).evaluate(el=>(el.value!==undefined?el.value:el.innerText).replace(/ /g,' '));
 const wait=ms=>new Promise(r=>setTimeout(r,ms));
 async function clearField(pg,fr,sel){await fr.click(sel);await pg.keyboard.press('Control+A');await pg.keyboard.press('Backspace');await wait(80)}
 // type "rin" -> ghost "ging", visible, on top; Tab; " cx " -> formatted
 async function basic(name,pg,fr,sel,o={}){
  const off=o.off||{x:0,y:0};
  await pg.bringToFront();
  await clearField(pg,fr,sel);await pg.keyboard.type('rin',{delay:15});await wait(300);
  const gi=await overlayInfo(fr);
  ok(!!gi&&gi.text==='ging',`${name}: type "rin" -> ghost "ging" (got ${gi&&gi.text})`);
  if(gi){
   const fb=await fr.locator(sel).evaluate(el=>{const r=el.getBoundingClientRect();return{l:r.left,t:r.top,r:r.right,b:r.bottom}});
   const g=gi.ghost;
   ok(g.l>=fb.l-1&&g.l+g.w<=fb.r+1&&g.t>=fb.t-1&&g.t+g.h<=fb.b+1,`${name}: ghost rect lies inside the field (ghost ${Math.round(g.l)},${Math.round(g.t)} ${Math.round(g.w)}x${Math.round(g.h)}; field ${Math.round(fb.l)},${Math.round(fb.t)}-${Math.round(fb.r)},${Math.round(fb.b)})`);
   ok(gi.pos==='fixed'&&gi.z==='2147483647'&&gi.isLast&&gi.vis==='visible',`${name}: overlay fixed, max z-index, last child of ${gi.parent}`);
   if(o.parent)ok(gi.parent===o.parent,`${name}: overlay parent is ${gi.parent} (want ${o.parent})`);
   const n=await greys(pg,{x:off.x+g.l,y:off.y+g.t,w:g.w,h:g.h});
   ok(n>=15,`${name}: grey ghost pixels are painted on top (${n} px)`);
   if(o.shot)await pg.screenshot({path:shots+o.shot});
  }
  await pg.keyboard.press('Tab');await wait(150);
  ok(await fval(fr,sel)==='Ringing',`${name}: Tab accepts -> ${JSON.stringify(await fval(fr,sel))}`);
  await pg.keyboard.type(' cx ',{delay:15});await wait(200);
  const v=await fval(fr,sel);
  ok(/^Ringing [Cc]ustomer $/.test(v),`${name}: " cx " is formatted -> ${JSON.stringify(v)}`);
 }
 // Esc with a ghost: ghost goes, the modal stays. Tab without a ghost: the modal's trap still works.
 async function modalKeys(name,pg,fr,sel,closeCheck){
  await clearField(pg,fr,sel);await pg.keyboard.type('zzzz',{delay:10});await wait(200);
  ok((await overlayInfo(fr))===null,`${name}: no ghost for "zzzz"`);
  if(closeCheck.trap){const t0=await pg.evaluate(()=>state.trap);await pg.keyboard.press('Tab');await wait(100);
   ok((await pg.evaluate(()=>state.trap))===t0+1,`${name}: Tab with no ghost still reaches the modal focus trap`);
   ok(await pg.evaluate(()=>document.activeElement.id)==='other',`${name}: focus trap moved focus`);}
  await clearField(pg,fr,sel);await pg.keyboard.type('rin',{delay:15});await wait(250);
  ok((await overlayInfo(fr))!==null,`${name}: ghost shown before Esc`);
  await pg.keyboard.press('Escape');await wait(250);
  ok((await overlayInfo(fr))===null,`${name}: Esc hides ghost`);
  ok(await closeCheck.stillOpen(),`${name}: Esc with a ghost does NOT close the modal`);
  if(closeCheck.cancelZero)ok((await pg.evaluate(()=>state.cancel))===0,`${name}: dialog got no cancel event`);
  await pg.keyboard.press('Escape');await wait(250);
  ok(!(await closeCheck.stillOpen()),`${name}: Esc without a ghost closes the modal as before`);
 }
 const open=async(url)=>{const pg=await ctx.newPage();await pg.goto(url);await pg.bringToFront();return pg};

 // ---- a) div modal: z-index, transform, animation, document-level focus trap ----
 { const pg=await open(`${O1}/popup.html?case=modal`);await wait(600);
   await basic('a modal',pg,pg,'#f',{shot:'a-modal.png',parent:'BODY'});
   await modalKeys('a modal',pg,pg,'#f',{trap:true,stillOpen:async()=>!(await pg.evaluate(()=>state.closed))});
   await pg.close(); }
 // ---- a2) modal with z-index 2147483647 added after the overlay exists ----
 { const pg=await open(`${O1}/popup.html?case=modalmax`);
   await pg.click('#warm');await pg.keyboard.type('rin',{delay:15});await wait(300);
   ok((await overlayInfo(pg))!==null,'a2 max-z modal: overlay exists on the plain page first');
   await pg.evaluate(()=>openModal(2147483647));await wait(600);
   await basic('a2 max-z modal',pg,pg,'#f',{shot:'a2-modal-maxz.png'});
   await pg.close(); }
 // ---- b) <dialog> with showModal() (top layer) ----
 { const pg=await open(`${O1}/popup.html?case=dialog`);await wait(300);
   ok(await pg.evaluate(()=>document.querySelector('dialog').matches(':modal')),'b dialog: is a modal dialog (top layer)');
   await basic('b dialog',pg,pg,'#f',{shot:'b-dialog.png',parent:'DIALOG'});
   await modalKeys('b dialog',pg,pg,'#f',{trap:false,cancelZero:true,stillOpen:async()=>pg.evaluate(()=>document.getElementById('dlg').open)});
   await pg.close(); }
 // ---- c) cross-origin iframe inside a modal (page on localhost, frame on 127.0.0.1) ----
 { const pg=await open(`${O1}/popup.html?case=hostframe&src=${encodeURIComponent(O2+'/popup.html?case=plain')}`);await wait(1200);
   const fr=pg.frames().find(f=>f.url().startsWith(O2));
   ok(!!fr,'c iframe: cross-origin frame found');
   const bb=await pg.locator('#fr').boundingBox();
   await basic('c cross-origin iframe',pg,fr,'#f',{shot:'c-iframe.png',off:{x:bb.x,y:bb.y}});
   await pg.keyboard.type('x');await clearField(pg,fr,'#f');await pg.keyboard.type('rin',{delay:15});await wait(250);
   await pg.keyboard.press('Escape');await wait(200);
   ok((await overlayInfo(fr))===null,'c iframe: Esc hides ghost in frame');
   await pg.close(); }
 // ---- d) about:blank iframe filled with document.write ----
 for(const [label,delay] of [['d about:blank iframe, write at once',0],['d about:blank iframe, write after 1.5 s',1500]]){
   const pg=await open(`${O1}/popup.html?case=blank`);await wait(400);
   await pg.evaluate(async(delay)=>{const f=document.createElement('iframe');f.style.cssText='width:360px;height:160px;border:0;display:block;background:#fff';document.body.appendChild(f);f.id='fr';
     const w=()=>{const d=f.contentDocument;d.open();d.write('<!doctype html><body style="margin:0"><textarea id="f" style="width:300px;height:80px;font:16px/1.4 Arial;padding:8px;border:1px solid #888;box-sizing:border-box;background:#fff"></textarea></body>');d.close()};
     if(delay)await new Promise(r=>setTimeout(r,delay));w()},delay);
   await wait(700);
   const fr=pg.frames().find(f=>f!==pg.mainFrame());ok(!!fr&&fr.url()==='about:blank',`${label}: frame url ${fr&&fr.url()}`);
   const bb=await pg.locator('#fr').boundingBox();
   await basic(label,pg,fr,'#f',{off:{x:bb.x,y:bb.y}});
   await pg.close(); }
 // ---- e) srcdoc iframe ----
 { const pg=await open(`${O1}/popup.html?case=blank`);await wait(400);
   await pg.evaluate(()=>{const f=document.createElement('iframe');f.id='fr';f.style.cssText='width:360px;height:160px;border:0;display:block;background:#fff';
     f.srcdoc='<!doctype html><body style="margin:0"><textarea id="f" style="width:300px;height:80px;font:16px/1.4 Arial;padding:8px;border:1px solid #888;box-sizing:border-box"></textarea></body>';document.body.appendChild(f)});
   await wait(800);
   const fr=pg.frames().find(f=>f!==pg.mainFrame());ok(!!fr&&fr.url()==='about:srcdoc',`e srcdoc iframe: frame url ${fr&&fr.url()}`);
   const bb=await pg.locator('#fr').boundingBox();
   await basic('e srcdoc iframe',pg,fr,'#f',{off:{x:bb.x,y:bb.y}});
   await pg.close(); }
 // ---- j) same-origin iframe with src ----
 { const pg=await open(`${O1}/popup.html?case=hostframe&src=${encodeURIComponent('/popup.html?case=plain')}`);await wait(1000);
   const fr=pg.frames().find(f=>f!==pg.mainFrame());const bb=await pg.locator('#fr').boundingBox();
   await basic('j same-origin iframe',pg,fr,'#f',{off:{x:bb.x,y:bb.y}});
   await pg.close(); }
 // ---- f) textarea in an open shadow root, inside a modal ----
 { const pg=await open(`${O1}/popup.html?case=shadow`);await wait(600);
   await basic('f shadow DOM textarea',pg,pg,'#f',{shot:'f-shadow.png'});
   await modalKeys('f shadow DOM',pg,pg,'#f',{trap:true,stillOpen:async()=>!(await pg.evaluate(()=>state.closed))});
   await pg.close(); }
 { const pg=await open(`${O1}/popup.html?case=shadow`);await wait(600);
   await basic('f2 contenteditable in shadow DOM',pg,pg,'#ce',{shot:'f2-shadow-ce.png'});
   await pg.close(); }
 // ---- g) contenteditable ----
 { const pg=await open(`${O1}/popup.html?case=ce`);
   await basic('g contenteditable (div, normal white-space)',pg,pg,'#f',{shot:'g-ce.png'});
   await pg.close(); }
 { const pg=await open(`${O1}/popup.html?case=ce&ws=pre`);
   await basic('g contenteditable (pre-wrap)',pg,pg,'#f',{});
   // lines made with Enter (<div>)
   await clearField(pg,pg,'#f');await pg.keyboard.type('ringing busy');await pg.keyboard.press('Enter');await pg.keyboard.type('not int',{delay:5});await wait(300);
   let gi=await overlayInfo(pg);ok(!!gi&&gi.text==='erested',`g ce, <div> lines: ghost on line 2 = ${gi&&gi.text}`);
   ok(await pg.evaluate(()=>!!document.querySelector('#f div')),'g ce: Enter made <div> lines');
   await pg.screenshot({path:shots+'g-ce-lines.png'});
   await pg.keyboard.press('Tab');await wait(150);
   ok((await fvalML(pg,'#f')).endsWith('Not interested'),`g ce, <div> lines: Tab on line 2 -> ${JSON.stringify(await fvalML(pg,'#f'))}`);
   // ghost clipped at the right edge: long ghost in a narrow box
   await pg.evaluate(()=>{document.getElementById('f').style.width='180px'});
   await clearField(pg,pg,'#f');await pg.keyboard.type('after the call op',{delay:5});await wait(300);
   gi=await overlayInfo(pg);const fr0=await pg.locator('#f').boundingBox();
   ok(!!gi&&gi.ov.l+gi.ov.w<=fr0.x+fr0.width+1,`g ce: long ghost is clipped to the field edge (overlay right ${gi&&Math.round(gi.ov.l+gi.ov.w)} <= ${Math.round(fr0.x+fr0.width)})`);
   await pg.screenshot({path:shots+'g-ce-clip.png'});
   await pg.evaluate(()=>{document.getElementById('f').style.width='300px'});
   // live format
   await clearField(pg,pg,'#f');await pg.keyboard.type('cx ',{delay:15});await wait(150);
   ok(await fvalML(pg,'#f')==='Customer ',`g ce: live format "cx " -> ${JSON.stringify(await fvalML(pg,'#f'))}`);
   await pg.keyboard.press('Backspace');await wait(150);
   ok(await fvalML(pg,'#f')==='cx',`g ce: Backspace undoes the format -> ${JSON.stringify(await fvalML(pg,'#f'))}`);
   await pg.keyboard.type(' ');await wait(100);
   ok(await fvalML(pg,'#f')==='cx ',`g ce: undone key stays -> ${JSON.stringify(await fvalML(pg,'#f'))}`);
   await clearField(pg,pg,'#f');await pg.keyboard.type('ok');await pg.keyboard.press('Enter');await pg.keyboard.type('rnr ',{delay:15});await wait(200);
   ok(await fvalML(pg,'#f')==='OK\nRinging ',`g ce: newline + capital -> ${JSON.stringify(await fvalML(pg,'#f'))}`);
   ok(await pg.evaluate(()=>{const s=getSelection();return s.isCollapsed&&document.getElementById('f').contains(s.anchorNode)}),'g ce: caret still in the field after live format');
   await pg.close(); }
 { const pg=await open(`${O1}/popup.html?case=ce`);
   // lines made with Shift+Enter (<br>)
   await clearField(pg,pg,'#f');await pg.keyboard.type('ringing busy');await pg.keyboard.press('Shift+Enter');await pg.keyboard.type('not int',{delay:5});await wait(300);
   ok(await pg.evaluate(()=>!!document.querySelector('#f br')),'g ce: Shift+Enter made <br>');
   gi=await overlayInfo(pg);ok(!!gi&&gi.text==='erested',`g ce, <br> lines: ghost on line 2 = ${gi&&gi.text}`);
   await pg.keyboard.press('Tab');await wait(150);
   ok((await fvalML(pg,'#f')).endsWith('Not interested'),`g ce, <br> lines: Tab -> ${JSON.stringify(await fvalML(pg,'#f'))}`);
   await pg.close(); }
 { const pg=await open(`${O1}/popup.html?case=ce&ws=pre`);
   // blur formats a plain field (both line styles)
   await clearField(pg,pg,'#f');await pg.keyboard.type('CX IS LOOKING AERO PLUS DESK');await pg.keyboard.press('Enter');await pg.keyboard.type('CB TOMM');
   await pg.click('#other');await wait(200);
   ok(await fvalML(pg,'#f')==='Customer is looking AeroPlus desk\nCall back tomorrow',`g ce: blur formats whole note (div lines) -> ${JSON.stringify(await fvalML(pg,'#f'))}`);
   ok(await pg.evaluate(()=>document.activeElement.id)==='other','g ce: blur format did not steal focus');
   await clearField(pg,pg,'#f');await pg.keyboard.type('CX IS BUSY');await pg.keyboard.press('Shift+Enter');await pg.keyboard.type('CB TOMM');
   await pg.click('#other');await wait(200);
   ok(await fvalML(pg,'#f')==='Customer is busy\nCall back tomorrow',`g ce: blur formats whole note (br lines) -> ${JSON.stringify(await fvalML(pg,'#f'))}`);
   ok(await pg.evaluate(()=>!!document.querySelector('#f br')&&!document.querySelector('#f div')),'g ce: br structure kept');
   await pg.close(); }
 { const pg=await open(`${O1}/popup.html?case=cerich`);
   await pg.click('#f');await pg.keyboard.press('End');await pg.keyboard.type('X');await wait(100);
   await pg.click('#other');await wait(200);
   ok(await pg.evaluate(()=>document.getElementById('f').innerHTML.includes('<b>CX</b>'))&&!/Customer/.test(await fvalML(pg,'#f')),`g ce with markup: blur format skipped, <b> kept -> ${await pg.evaluate(()=>document.getElementById('f').innerHTML)}`);
   await pg.close(); }
 { const pg=await open(`${O1}/popup.html?case=cerole`);
   await basic('g role=textbox contenteditable=plaintext-only',pg,pg,'#f',{});
   await pg.close(); }
 { const pg=await open(`${O1}/popup.html?case=cemodal`);await wait(600);
   await basic('g contenteditable in modal',pg,pg,'#f',{shot:'g-ce-modal.png'});
   await pg.close(); }

 // ---- h) real pop-up windows ----
 { const pg=await open(`${O1}/popup.html?case=blank`);
   const [pw]=await Promise.all([ctx.waitForEvent('page'),pg.evaluate(()=>{window.__w=window.open('about:blank','','width=500,height=400')})]);
   await wait(500);
   await pg.evaluate(()=>{const d=window.__w.document;d.open();d.write('<!doctype html><body style="margin:20px"><textarea id="f" style="width:300px;height:80px;font:16px/1.4 Arial;padding:8px;border:1px solid #888;box-sizing:border-box"></textarea></body>');d.close()});
   await wait(500);
   await basic('h1 window.open(about:blank) + document.write',pw,pw,'#f',{shot:'h1-popup-window.png'});
   await pw.close();
   await pg.close(); }
 { const pg=await open(`${O1}/popup.html?case=blank`);
   const [pw]=await Promise.all([ctx.waitForEvent('page'),pg.evaluate(()=>{window.__w=window.open('about:blank','','width=500,height=400')})]);
   await wait(2000);
   await pg.evaluate(()=>{const d=window.__w.document;d.open();d.write('<!doctype html><body style="margin:20px"><textarea id="f" style="width:300px;height:80px;font:16px/1.4 Arial;padding:8px;border:1px solid #888;box-sizing:border-box"></textarea></body>');d.close()});
   await wait(500);
   await basic('h1b window.open(about:blank), write after 2 s',pw,pw,'#f',{});
   await pw.close();await pg.close(); }
 { const pg=await open(`${O1}/popup.html?case=blank`);
   const [pw]=await Promise.all([ctx.waitForEvent('page'),pg.evaluate((u)=>{window.open(u,'','width=500,height=400')},`${O1}/popup.html?case=modal`)]);
   await pw.waitForLoadState();await wait(700);
   await basic('h2 window.open of a localhost page',pw,pw,'#f',{});
   await pw.close();await pg.close(); }

 // ---- i) frame guard ----
 { const pg=await open(`${OG}/popup.html?case=plain`);
   await pg.click('#f');await pg.keyboard.type('rin',{delay:15});await wait(300);
   ok((await overlayInfo(pg))===null,'i guard: top-level page on guard.test (not in guard list) gets no ghost');
   const lf=await lastField();
   ok(lf&&lf.eligible===false&&lf.reason==='frame not inside LeadSquared'&&lf.frameHost.startsWith('guard.test'),`i guard: lastField says blocked -> ${JSON.stringify(lf&&{eligible:lf.eligible,reason:lf.reason,frameHost:lf.frameHost})}`);
   await pg.keyboard.press('Tab');await wait(100);
   ok(await pg.evaluate(()=>document.activeElement.id)==='other','i guard: Tab behaves normally in blocked frame');
   await pg.close(); }
 { // same page, but inside a frame of an allowed page: ancestor origin allows it
   const pg=await open(`${O1}/popup.html?case=hostframe&src=${encodeURIComponent(O2.replace('127.0.0.1','guard.test')+'/popup.html?case=plain')}`);await wait(1200);
   const fr=pg.frames().find(f=>f.url().startsWith('http://guard.test'));const bb=await pg.locator('#fr').boundingBox();
   await basic('i guard: guard.test frame inside an allowed page (ancestorOrigins)',pg,fr,'#f',{off:{x:bb.x,y:bb.y}});
   const lf=await lastField();
   ok(lf&&lf.topFrame===false&&lf.ancestorOrigins.some(o=>o.startsWith('http://localhost')),`i guard: lastField lists ancestorOrigins -> ${JSON.stringify(lf&&lf.ancestorOrigins)}`);
   await pg.close(); }
 { // pop-up window on a guarded host, opened by an allowed page (referrer allows it)
   const pg=await open(`${O1}/popup.html?case=blank`);
   const [pw]=await Promise.all([ctx.waitForEvent('page'),pg.evaluate((u)=>{window.open(u,'','width=500,height=400')},`${OG}/popup.html?case=plain`)]);
   await pw.waitForLoadState();await wait(700);
   await basic('i guard: guard.test pop-up opened by an allowed page (referrer/opener)',pw,pw,'#f',{});
   await pw.close();await pg.close(); }
 { // guard function, cases
   const pg=await open(`${OG}/popup.html?case=plain`);
   const src=fs.readFileSync(path.join(__dirname,'..','extension','content.js'),'utf8');
   const m=/function hostOk\(h\) \{[\s\S]*?\n  \}/.exec(src);
   const hostOk=new Function('GUARD_DOMAINS',m[0]+'; return hostOk;')(['leadsquared.com']);
   ok(hostOk('app.leadsquared.com')&&hostOk('leadsquared.com')&&hostOk('X.Y.leadsquared.com'),'i guard unit: leadsquared.com and subdomains pass');
   ok(!hostOk('lsqportal.com')&&!hostOk('a.lsqportal.com')&&!hostOk('x.leadsquaredcdn.com')&&!hostOk('evilleadsquared.com')&&!hostOk('leadsquared.com.evil.io')&&!hostOk(''),'i guard unit: portal, cdn, look-alike and empty hosts are blocked');
   const man=JSON.parse(fs.readFileSync(path.join(__dirname,'..','extension','manifest.json'),'utf8'));
   const want=['https://*.leadsquared.com/*','https://*.leadsquaredcdn.com/*','https://*.lsqportal.com/*'];
   const cs=man.content_scripts[0];
   ok(JSON.stringify(cs.matches)===JSON.stringify(want)&&JSON.stringify(man.web_accessible_resources[0].matches)===JSON.stringify(want),'manifest: shipped matches are the three LeadSquared domains only');
   ok(cs.all_frames===true&&cs.match_about_blank===true&&cs.match_origin_as_fallback===true&&man.version==='1.2.0','manifest: all_frames, match_about_blank, match_origin_as_fallback, version 1.2.0');
   await pg.close(); }

 // ---- eligibility + "Last field" diagnostic ----
 { const pg=await open(`${O1}/popup.html?case=elig`);
   const keys=['ancestorOrigins','contentEditable','eligible','frameHost','inDialog','inShadowDom','reason','role','tag','time','topFrame','type','version'];
   const chk=async(sel,eligible,reason,label)=>{await pg.click(sel);const lf=await lastField();
     ok(lf&&lf.eligible===eligible&&lf.reason===reason,`lastField ${label}: eligible=${lf&&lf.eligible} reason=${JSON.stringify(lf&&lf.reason)}`);return lf};
   let lf=await chk('#phone-9876543210',false,'type=email','input type=email');
   ok(JSON.stringify(Object.keys(lf).sort())===JSON.stringify(keys),`lastField has only the listed keys: ${Object.keys(lf).sort().join(',')}`);
   ok(lf.tag==='input'&&lf.type==='email'&&lf.topFrame===true&&lf.frameHost.startsWith('localhost')&&lf.inShadowDom===false&&lf.inDialog===false&&lf.contentEditable==='no','lastField attributes for input');
   await chk('#ro',false,'read-only','readonly textarea');
   await chk('#cb',false,'combobox','role=combobox');
   await chk('#al',false,'aria-autocomplete=list','aria-autocomplete=list');
   await chk('#pw',false,'type=password','password');
   await chk('#an',true,'','aria-autocomplete=none');
   await pg.keyboard.type('rin',{delay:15});await wait(250);
   ok((await overlayInfo(pg))&&(await overlayInfo(pg)).text==='ging','aria-autocomplete="none" input gets a ghost');
   await pg.fill('#al','');await pg.click('#al');await pg.keyboard.type('rin',{delay:15});await wait(250);
   ok((await overlayInfo(pg))===null,'aria-autocomplete="list" input gets no ghost');
   await pg.fill('#cb','');await pg.click('#cb');await pg.keyboard.type('rin',{delay:15});await wait(250);
   ok((await overlayInfo(pg))===null,'role=combobox input gets no ghost');
   await pg.click('#ok');await pg.keyboard.type('SECRETTYPED rin',{delay:5});await wait(250);
   lf=await lastField();
   const raw=JSON.stringify(await sw.evaluate(()=>chrome.storage.local.get(null)));
   ok(lf&&lf.eligible===true&&lf.tag==='textarea','lastField for the eligible textarea');
   ok(!/SECRET|9876543210|cust-secret|5551234|customer-notes|rin"/.test(raw),'storage holds no typed text, value, name or id: '+raw.slice(0,200));
   await pg.close(); }
 { const pg=await open(`${O1}/popup.html?case=dialog`);await wait(300);
   await pg.click('#f');let lf=await lastField();
   ok(lf&&lf.inDialog===true&&lf.eligible===true,`lastField inDialog for <dialog> -> ${JSON.stringify(lf&&{inDialog:lf.inDialog})}`);
   await pg.close(); }
 { const pg=await open(`${O1}/popup.html?case=shadow`);await wait(500);
   await pg.click('#f');let lf=await lastField();
   ok(lf&&lf.inShadowDom===true&&lf.inDialog===true,`lastField inShadowDom + inDialog for shadow textarea in role=dialog -> ${JSON.stringify(lf&&{s:lf.inShadowDom,d:lf.inDialog})}`);
   await pg.click('#ce');lf=await lastField();
   ok(lf&&lf.tag==='div'&&lf.contentEditable==='true'&&lf.inShadowDom===true,`lastField for contenteditable in shadow -> ${JSON.stringify(lf&&{tag:lf.tag,ce:lf.contentEditable})}`);
   await pg.close(); }
 { const pg=await open(`${O1}/popup.html?case=blank`);
   await pg.evaluate(()=>{const f=document.createElement('iframe');f.id='fr';f.srcdoc='<textarea id="f"></textarea>';document.body.appendChild(f)});await wait(700);
   const fr=pg.frames().find(f=>f!==pg.mainFrame());await fr.click('#f');const lf=await lastField();
   ok(lf&&lf.frameHost==='(about:blank/srcdoc)'&&lf.topFrame===false&&lf.ancestorOrigins.length>0,`lastField for srcdoc frame -> ${JSON.stringify(lf&&{h:lf.frameHost,top:lf.topFrame,a:lf.ancestorOrigins})}`);
   await pg.close(); }
 // popup page: "Last field" in plain words, Debug log checkbox
 { const pg=await open(`${O1}/popup.html?case=plain`);
   const logs=[];pg.on('console',m=>{if(m.text().includes('[CAN]')||m.args().length&&m.text()==='[CAN]')logs.push(m.text())});
   await pg.click('#f');await wait(300);
   ok(logs.length===0,'debug log is off by default: no [CAN] console line');
   await pp.bringToFront();await pp.reload();await wait(500);
   const txt=await pp.locator('#lastSection').innerText();
   ok(/Last field/.test(txt)&&/Text area/.test(txt)&&/CAN can work here/.test(txt)&&/yes/.test(txt)&&/main page/.test(txt),'popup shows the Last field section in plain words: '+txt.replace(/\n/g,' | ').slice(0,200));
   ok(txt.includes('If CAN does not work in a form: click in the notes box, then open this popup and send a screenshot of this section.'),'popup shows the report line');
   ok(!/SECRET/.test(txt),'popup shows no typed text');
   await pp.screenshot({path:shots+'popup-last-field.png'});
   ok(await pp.locator('#dbg').isVisible()&&!(await pp.locator('#dbg').isChecked()),'popup has Debug log checkbox, off by default');
   await pp.check('#dbg');await wait(300);
   ok((await pp.evaluate(()=>new Promise(r=>chrome.storage.sync.get('debug',x=>r(x.debug)))))===true,'Debug log checkbox saves sync.debug');
   await pg.bringToFront();await pg.click('#other');await pg.click('#f');await wait(300);
   ok(logs.some(l=>l.includes('[CAN]')),'debug on: console.info("[CAN]", ...) appears');
   await pp.bringToFront();await pp.uncheck('#dbg');
   await pg.close(); }

 console.log(fails?fails+' FAILED':'ALL PASSED');await ctx.close();srv.close();srv2.close();process.exit(fails?1:0);
})().catch(e=>{console.error(e);process.exit(2)});
