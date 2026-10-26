const {chromium}=require('playwright');const http=require('http');const fs=require('fs');const os=require('os');const path=require('path');
// Test copy of the extension that also runs on localhost (the shipped one runs on leadsquared.com only)
const ext=fs.mkdtempSync(path.join(os.tmpdir(),'can-ext-'));fs.cpSync(path.join(__dirname,'..','extension'),ext,{recursive:true});{const mf=JSON.parse(fs.readFileSync(path.join(ext,'manifest.json')));mf.content_scripts[0].matches.push('http://localhost/*');mf.web_accessible_resources[0].matches.push('http://localhost/*');fs.writeFileSync(path.join(ext,'manifest.json'),JSON.stringify(mf));}
const shots=path.join(__dirname,'screens')+'/';fs.mkdirSync(shots,{recursive:true});
const srv=http.createServer((q,r)=>{r.setHeader('content-type','text/html');r.end(fs.readFileSync(path.join(__dirname,'page.html')))}).listen(0);
let fails=0;const ok=(c,m)=>{console.log(c?'PASS':'FAIL',m);if(!c)fails++};
(async()=>{
 const port=srv.address().port;
 const ctx=await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(),'can-')),{headless:false,args:['--headless=new',`--disable-extensions-except=${ext}`,`--load-extension=${ext}`]});
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
 console.log(fails?fails+' FAILED':'ALL PASSED');await ctx.close();srv.close();process.exit(fails?1:0);
})().catch(e=>{console.error(e);process.exit(2)});
