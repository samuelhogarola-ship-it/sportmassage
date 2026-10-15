import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const host = 'https://analytics.187.124.55.36.sslip.io';
async function load(config) {
 assert.ok(existsSync('umami-analytics.js'),'loader exists');
 const scripts=[];const window={};
 const document={querySelector:()=>scripts[0],createElement:()=>({dataset:{}}),head:{appendChild:s=>scripts.push(s)}};
 vm.runInNewContext(readFileSync('umami-analytics.js','utf8'),{window,document,fetch:async()=>({ok:true,json:async()=>config})});
 await window.SportMassageUmami.ready;await window.SportMassageUmami.init();return scripts;
}
test('loads exactly one tracker for the configured site',async()=>{
 const scripts=await load({hostUrl:host,websiteId:'test-sport-site'});
 assert.equal(scripts.length,1);assert.equal(scripts[0].src,host+'/script.js');
 assert.equal(scripts[0].dataset.domains,'sportmassagefuengirola.com,www.sportmassagefuengirola.com');
});
test('empty config or a different analytics host loads nothing',async()=>{
 for(const config of [null,{hostUrl:host,websiteId:''},{hostUrl:'https://example.com',websiteId:'test-sport-site'}])assert.deepEqual(await load(config),[]);
});
test('static pages load Umami and contain no GA',()=>{
 for(const p of ['index.html','legal.html']) {
 const html=readFileSync(p,'utf8');assert.match(html,/<script defer src="\/umami-analytics.js"><\/script>/);assert.doesNotMatch(html,/googletagmanager\.com|google-analytics\.com/);
 }
});
test('WordPress blog has a dedicated frontend-only wp_head hook',()=>{
 const p='wordpress-mu-plugins/wf-umami.php';assert.ok(existsSync(p));
 const php=readFileSync(p,'utf8');assert.match(php,/add_action\('wp_head'/);assert.match(php,/is_admin\(\)/);assert.match(php,/\/umami-analytics.js/);
});
