const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch();const pg=await b.newPage({viewport:{width:390,height:844},deviceScaleFactor:+(process.argv[2]||1)});
for(const f of process.argv.slice(3)){await pg.goto('file://'+__dirname+'/'+f+'.html');await pg.waitForTimeout(250);await pg.screenshot({path:f+'.png'});}
await b.close();})();
