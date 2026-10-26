const S=require('../extension/suggest.js');
const m=require('../extension/model.json');
let fail=0;
function t(inp,check,label){const r=S.suggest(m,inp);const ok=check(r);if(!ok)fail++;console.log(ok?'PASS':'FAIL',JSON.stringify(inp),'->',JSON.stringify(r),label||'');}
const eq=x=>r=>r===x, sw=x=>r=>r.startsWith(x);
t('call back',eq(''),'(exact frequent phrase: quiet)');t('customer h',eq('ung up'));t('call bac',eq('k'));t('ring',eq('ing'));t('rin',eq('ging'));t('vo',eq('ice mail'));t('not int',eq('erested'));
t('after the',eq(' call opening customer disconnected the call'));
t('after the call op',sw('ening'));
t('CUSTOMER IS LOOK',r=>r&&r===r.toUpperCase());
t('customer is looking for ',r=>r.length>0);
t('',eq(''));t('zzzz',eq(''));t('   ',eq(''));
t('ringing, vo',eq('ice mail'),'(after separator)');
t('ringing.',eq(''));
t('x'.repeat(5),eq(''));
let n=0,mx=0;const ps=m.phrases;const t0=process.hrtime.bigint();
for(const p of ps){for(const k of [2,4,7]){const a=process.hrtime.bigint();S.suggest(m,p[0].slice(0,k));const d=Number(process.hrtime.bigint()-a)/1e6;if(d>mx)mx=d;n++;}}
console.log('calls',n,'avg ms',(Number(process.hrtime.bigint()-t0)/1e6/n).toFixed(3),'max ms',mx.toFixed(2));
console.log(fail?fail+' FAILED':'ALL PASSED');process.exit(fail?1:0);
