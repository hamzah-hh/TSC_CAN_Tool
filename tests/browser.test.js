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
 ok(await p.inputValue('#rx')==='ringing','Tab accepted: '+await p.inputValue('#rx'));
 ok(await p.evaluate(()=>window.rv)==='ringing','react-like state got value');
 ok(await p.evaluate(()=>log.some(l=>l==='rx-input:ringing')),'input event fired on accept');
 await type('#ta','after the call op');ok((await ghost()||'').startsWith('ening customer'),'ta ghost: '+await ghost());
 await p.screenshot({path:shots+'textarea.png'});
 await p.keyboard.press('Tab');ok(await p.inputValue('#ta')==='after the call opening customer disconnected the call','ta Tab: '+await p.inputValue('#ta'));
 await type('#in','vo');ok(await ghost()==='ice mail','input ghost: '+await ghost());
 await p.screenshot({path:shots+'input.png'});
 await p.keyboard.press('Escape');ok(await ghost()===null,'Esc hides');
 await p.keyboard.type('i');await p.waitForTimeout(100);ok(await p.inputValue('#in')==='voi','typing after Esc ok');
 await p.fill('#in','');await type('#in','not int');
 await p.keyboard.press('Control+ArrowRight');await p.waitForTimeout(100);ok(await p.inputValue('#in')==='not interested'||(await p.inputValue('#in')).startsWith('not interested'),'Ctrl+Right: '+await p.inputValue('#in'));
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
 console.log(fails?fails+' FAILED':'ALL PASSED');await ctx.close();srv.close();process.exit(fails?1:0);
})().catch(e=>{console.error(e);process.exit(2)});
