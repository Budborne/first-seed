const canvas=document.getElementById("world");
const ctx=canvas.getContext("2d",{alpha:false});

const KEY="budborne:first-seed";
const HOME_KEY="budborne:home-v1";
const EXP_KEY="budborne:expedition-v2";
const BATTLE_RESULT_KEY="budborne:battle-result";
const HOUR=3600000;

const STAGES=[
  {key:"seed",name:"Seed",min:0,next:12},
  {key:"sprout",name:"Sprout",min:12,next:30},
  {key:"shoot",name:"Shoot",min:30,next:65},
  {key:"youngling",name:"Youngling",min:65,next:120},
  {key:"budborn",name:"Budborn",min:120,next:null}
];

const EXP_ENCOUNTERS=[
  {
    title:"Glassleaf thicket",
    text:"A curtain of glass-thin leaves blocks the trail. They chime when the breeze moves through them.",
    choices:[
      {label:"Harvest carefully",hint:"+ Wild Seed · +1.2h",time:1.2,loot:"wildSeed",result:"You work around the brittle stems and find a viable seed tucked beneath the roots."},
      {label:"Listen first",hint:"Slower · safer clue",time:.9,result:"You wait until the ringing changes. A narrow opening becomes obvious when the wind shifts."},
      {label:"Push through",hint:"Fast · may cost vigor",time:.45,risk:.35,result:"You shoulder through before the leaves can settle around you."}
    ]
  },
  {
    title:"Amber bark",
    text:"A split limb sweats amber resin. Fresh claw-like marks score the bark above it, but nothing moves nearby.",
    choices:[
      {label:"Scrape the resin",hint:"+ Amber Resin · +1.1h",time:1.1,loot:"resin",result:"You collect a sticky ribbon of amber resin and wrap it in broad leaves."},
      {label:"Study the marks",hint:"+0.6h · avoid trouble",time:.6,result:"The marks are old. Whatever made them has already moved deeper into the Hollow."},
      {label:"Keep moving",hint:"+0.3h · no loot",time:.3,result:"You leave the resin where it is. Some things are allowed to remain mysteries."}
    ]
  },
  {
    title:"Cold spring",
    text:"Clear water wells from black roots and vanishes beneath the moss. Creature Zero gives the smallest possible twitch.",
    choices:[
      {label:"Rest beside spring",hint:"Restore 1 vigor · +1.0h",time:1,heal:1,result:"The cold water and quiet do their work. You leave steadier than you arrived."},
      {label:"Search waterline",hint:"Chance of Dewstone · +0.8h",time:.8,chanceLoot:"dewstone",chance:.6,result:"You sift the pebbles where the spring disappears beneath the roots."},
      {label:"Move on",hint:"+0.25h",time:.25,result:"You take a drink and keep your momentum."}
    ]
  },
  {
    title:"Hookthorn crossing",
    text:"Hooked vines have knitted themselves across the trail. No enemy, just a plant with opinions about trespassing.",
    choices:[
      {label:"Go around",hint:"Safe · +1.2h",time:1.2,result:"The detour is slow, muddy, and completely uneventful. Excellent."},
      {label:"Cut a path",hint:"+0.7h · small risk",time:.7,risk:.2,result:"You open a narrow lane through the thorns and mark it for the return trip."},
      {label:"Force through",hint:"Fast · high risk",time:.3,risk:.55,result:"You commit to the gap before the vines can convince you otherwise."}
    ]
  },
  {
    title:"Dewstone hollow",
    text:"A pale stone glows beneath wet moss. Pulling it free would take time and leave you exposed in the open hollow.",
    choices:[
      {label:"Pry it free",hint:"+ Dewstone · +1.3h",time:1.3,loot:"dewstone",result:"The stone finally gives with a wet pop. It is colder than the spring water."},
      {label:"Search loose chips",hint:"Chance of Dewstone · +0.7h",time:.7,chanceLoot:"dewstone",chance:.45,result:"You search the edges for something easier to carry."},
      {label:"Leave it",hint:"+0.2h",time:.2,result:"You memorize the place and keep going."}
    ]
  },
  {
    title:"Root bridge",
    text:"Living roots span a narrow ravine. The bridge flexes when you test it.",
    choices:[
      {label:"Cross carefully",hint:"Safe · +0.9h",time:.9,result:"One measured step at a time. The roots hold."},
      {label:"Inspect underneath",hint:"Chance of Wild Seed · +1.1h",time:1.1,chanceLoot:"wildSeed",chance:.55,result:"You climb low enough to inspect the tangled underside before crossing."},
      {label:"Hurry across",hint:"Fast · moderate risk",time:.35,risk:.4,result:"You decide confidence and good footing are close enough cousins."}
    ]
  }
];

const state={
  view:{w:0,h:0,dpr:1},
  W:{layout:0,scene:0},
  sceneTarget:0,
  lastFrame:performance.now(),
  home:null,
  expedition:null,
  battle:null,
  homeSelected:null,
  homeMessage:"Tap somewhere in the clearing.",
  pointer:{x:0,y:0,down:false},
  buttons:[],
  pressed:null,
  message:"Creature Zero watches you.",
  bumpUntil:0,
  worldNow:0,
  creature:null,
  isoHome:{x:-2,y:1,path:[],from:null,to:null,t:0,target:null}
};

const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const lerp=(a,b,t)=>a+(b-a)*t;
const smoothstep=t=>t*t*(3-2*t);

const ASSETS={
  cottage:{src:"./cottage.PNG",img:new Image(),ready:false,failed:false},
  trail:{src:"./wild-trail.PNG",img:new Image(),ready:false,failed:false},
  store:{src:"./storehouse.PNG",img:new Image(),ready:false,failed:false}
};
for(const asset of Object.values(ASSETS)){
  asset.img.onload=()=>asset.ready=true;
  asset.img.onerror=()=>asset.failed=true;
  asset.img.src=asset.src;
}

const mixRect=(a,b,t)=>({
  x:lerp(a.x,b.x,t),
  y:lerp(a.y,b.y,t),
  w:lerp(a.w,b.w,t),
  h:lerp(a.h,b.h,t)
});

function text(str,x,y,opt={}){
  const size=opt.size||12;
  const weight=opt.weight||600;
  const family=opt.family||"system-ui,-apple-system,sans-serif";
  ctx.fillStyle=opt.color||"#dfe9d7";
  ctx.font=weight+" "+size+"px "+family;
  ctx.textAlign=opt.align||"left";
  ctx.textBaseline=opt.baseline||"top";
  ctx.fillText(str,x,y);
  return ctx.measureText(str).width;
}

function fitText(str,maxWidth,opt={}){
  const maxSize=opt.maxSize||42;
  const minSize=opt.minSize||10;
  const weight=opt.weight||600;
  const family=opt.family||"system-ui,-apple-system,sans-serif";
  ctx.font=weight+" "+maxSize+"px "+family;
  const measured=ctx.measureText(str).width;
  if(measured<=maxWidth)return maxSize;
  return clamp(maxSize*(maxWidth/measured),minSize,maxSize);
}

function wrapText(str,maxWidth,opt={}){
  const size=opt.size||16;
  const weight=opt.weight||600;
  const family=opt.family||"system-ui,-apple-system,sans-serif";
  ctx.font=weight+" "+size+"px "+family;
  const words=String(str).trim().split(/\s+/);
  const lines=[];
  let line="";
  for(const word of words){
    const test=line?line+" "+word:word;
    if(line&&ctx.measureText(test).width>maxWidth){
      lines.push(line);
      line=word;
    }else line=test;
  }
  if(line)lines.push(line);
  return lines;
}

function rrPath(x,y,w,h,r){
  const q=Math.min(r,w/2,h/2);
  ctx.beginPath();
  ctx.moveTo(x+q,y);
  ctx.arcTo(x+w,y,x+w,y+h,q);
  ctx.arcTo(x+w,y+h,x,y+h,q);
  ctx.arcTo(x,y+h,x,y,q);
  ctx.arcTo(x,y,x+w,y,q);
  ctx.closePath();
}
function fillRound(r,color,rad=14){
  rrPath(r.x,r.y,r.w,r.h,rad);
  ctx.fillStyle=color;
  ctx.fill();
}
function strokeRound(r,color,rad=14,width=1){
  rrPath(r.x+.5,r.y+.5,r.w-1,r.h-1,rad);
  ctx.strokeStyle=color;
  ctx.lineWidth=width;
  ctx.stroke();
}

function drawAssetContain(asset,r,opt={}){
  if(!asset||!asset.ready||!asset.img.naturalWidth)return false;
  const pad=opt.pad||0;
  const box={
    x:r.x+pad,
    y:r.y+pad,
    w:Math.max(1,r.w-pad*2),
    h:Math.max(1,r.h-pad*2)
  };
  const iw=asset.img.naturalWidth,ih=asset.img.naturalHeight;
  const scale=Math.min(box.w/iw,box.h/ih);
  const dw=iw*scale,dh=ih*scale;
  const x=box.x+(box.w-dw)/2;
  const y=box.y+(box.h-dh)/2+(opt.offsetY||0);

  ctx.save();
  if(Number.isFinite(opt.alpha))ctx.globalAlpha*=opt.alpha;
  ctx.drawImage(asset.img,x,y,dw,dh);
  ctx.restore();
  return true;
}

function stageFor(g){
  for(let i=STAGES.length-1;i>=0;i--)if(g>=STAGES[i].min)return STAGES[i];
  return STAGES[0];
}
function makeMemory(t){return {text:t,at:Date.now()}}
function homeHours(H){return ((H.day||1)-1)*24+(Number(H.hour)||0)}
function applyHomeHours(H,hours){
  H.hour=(Number(H.hour)||0)+hours;
  H.moist=Math.max(0,(Number.isFinite(H.moist)?H.moist:70)-hours*2.5);
  while(H.hour>=24){H.hour-=24;H.day=(H.day||1)+1}
  H.crops=(Array.isArray(H.crops)?H.crops:[0,0,0]).map(v=>v?Math.min(3,v+hours/6):0);
}
function saveHome(){
  if(state.home)localStorage.setItem(HOME_KEY,JSON.stringify(state.home));
}

function syncHomeClock(){
  const now=Date.now();
  let H={};
  try{H=JSON.parse(localStorage.getItem(HOME_KEY)||"{}")}catch(e){}
  H={
    hour:Number.isFinite(H.hour)?H.hour:8,
    day:H.day||1,
    seeds:Number.isFinite(H.seeds)?H.seeds:3,
    moist:Number.isFinite(H.moist)?H.moist:70,
    crops:Array.isArray(H.crops)?H.crops:[0,0,0],
    inventory:H.inventory||{wildSeed:0,resin:0,dewstone:0},
    lastRealMs:H.lastRealMs||now,
    ...H
  };
  const elapsed=Math.max(0,Math.min(720,(now-H.lastRealMs)/HOUR));
  if(elapsed>.01)applyHomeHours(H,elapsed);
  H.lastRealMs=now;
  localStorage.setItem(HOME_KEY,JSON.stringify(H));
  state.home=H;
  state.worldNow=homeHours(H);
}

function loadCreature(){
  let S={};
  try{S=JSON.parse(localStorage.getItem(KEY)||"{}")}catch(e){}
  if(S.version!==3){
    const oldDays=Math.max(1,Number(S.days)||1);
    S={
      version:3,
      growthProfile:"first-seed",
      growth:Number(S.growth)||0,
      care:Number(S.care)||0,
      water:Number.isFinite(S.water)?S.water:62,
      sun:Number.isFinite(S.sun)?S.sun:58,
      health:Number.isFinite(S.health)?S.health:100,
      worldSeenHours:state.worldNow,
      bornWorldHours:state.worldNow-((oldDays-1)*24),
      dormant:!!S.dormant,
      memories:Array.isArray(S.memories)&&S.memories.length?S.memories:[makeMemory("Creature Zero remembers the first garden.")]
    };
  }
  if(!S.growthProfile)S.growthProfile="first-seed";
  if(!Number.isFinite(S.worldSeenHours))S.worldSeenHours=state.worldNow;
  if(!Number.isFinite(S.bornWorldHours))S.bornWorldHours=state.worldNow;
  if(!S.lineage)S.lineage={generation:0,origin:"First Seed",parents:[]};
  if(!S.genome)S.genome={tempo:["Q","q"],light:["S","s"],vigor:["H","h"],thorn:["t","t"]};
  if(!Number.isFinite(S.bond))S.bond=Math.min(70,Math.round((Number(S.care)||0)/3));
  if(!S.careStyle)S.careStyle={water:0,sun:0,social:0};
  if(!Number.isFinite(S.lastBondWorldHours))S.lastBondWorldHours=-999;

  const delta=Math.max(0,state.worldNow-S.worldSeenHours);
  passWorldTime(S,delta);
  S.worldSeenHours=state.worldNow;
  state.creature=S;
  saveCreature();
}

function saveCreature(){
  localStorage.setItem(KEY,JSON.stringify(state.creature));
}

function remember(t){
  const S=state.creature;
  if(!Array.isArray(S.memories))S.memories=[];
  if(S.memories.some(m=>m.text===t))return;
  S.memories.unshift(makeMemory(t));
  S.memories=S.memories.slice(0,8);
}

function passWorldTime(S,hours){
  if(hours<=.001)return;
  const oldStage=stageFor(S.growth).key;
  const waterUse=1.8,lightUse=.9,growthPerHour=2.4;
  const healthyWaterHours=Math.max(0,(S.water-22)/waterUse);
  const healthyLightHours=Math.max(0,(S.sun-20)/lightUse);
  const healthyHours=Math.min(hours,healthyWaterHours,healthyLightHours);
  const stressedHours=Math.max(0,hours-healthyHours);

  if(!S.dormant){
    const vigor=clamp(S.health/100,.25,1);
    S.growth+=healthyHours*growthPerHour*vigor;
  }
  S.health=clamp(S.health+(healthyHours*.35)-(stressedHours*2.1),0,100);
  S.water=clamp(S.water-hours*waterUse,0,100);
  S.sun=clamp(S.sun-hours*lightUse,0,100);

  if(S.health<=10&&!S.dormant){
    S.dormant=true;
    remember("When care ran thin, Creature Zero folded inward and went dormant.");
  }
  if(stageFor(S.growth).key!==oldStage)remember("Creature Zero changed while home time passed.");
}

function mood(){
  const S=state.creature;
  if(S.dormant)return "dormant";
  if(S.health<35)return "weary";
  if(S.water<28)return "thirsty";
  if(S.sun<25)return "light-hungry";
  if(S.water>82)return "well-watered";
  if(S.health>88&&S.water>40&&S.sun>40)return "content";
  return "curious";
}

function care(kind){
  const S=state.creature;
  if(S.dormant){
    if(kind==="water"&&S.water<86){
      S.water=clamp(S.water+24,0,100);S.health=clamp(S.health+4,0,100);S.care++;
      state.message="The dry roots take a careful drink.";
    }else if(kind==="sun"&&S.sun<86){
      S.sun=clamp(S.sun+24,0,100);S.health=clamp(S.health+4,0,100);S.care++;
      state.message="Warmth reaches whatever is sleeping inside.";
    }else state.message=kind==="water"?"The soil is already wet enough.":"It has enough light for now.";
    if(S.health>=24&&S.water>=28&&S.sun>=28){
      S.dormant=false;remember("Creature Zero woke from dormancy.");
      state.message="A tiny movement. Creature Zero wakes.";
    }
    state.bumpUntil=performance.now()+240;
    saveCreature();
    return;
  }

  const oldStage=stageFor(S.growth).key;
  let useful=false;
  if(kind==="water"){
    if(S.water>=86)state.message="It turns a leaf away. The soil is wet enough.";
    else{
      if(!S.memories.some(m=>m.text==="First drink."))remember("First drink.");
      S.water=clamp(S.water+24,0,100);S.careStyle.water++;useful=true;
      state.message=["The roots loosen beneath the soil.","A quiet shiver runs up the stem.","Water disappears into the earth."][S.care%3];
    }
  }else{
    if(S.sun>=86)state.message="It has stored enough light for now.";
    else{
      if(!S.memories.some(m=>m.text==="First sunlight."))remember("First sunlight.");
      S.sun=clamp(S.sun+24,0,100);S.careStyle.sun++;useful=true;
      state.message=["It leans toward the warmth.","A leaf slowly turns toward the light.","For a moment, it seems taller."][S.care%3];
    }
  }

  if(useful){
    S.care++;S.growth+=1;S.bond=clamp(S.bond+.35,0,100);
    if(S.water>=30&&S.sun>=30)S.health=clamp(S.health+1.5,0,100);
    const st=stageFor(S.growth);
    if(st.key!==oldStage){
      remember("Creature Zero became a "+st.name+".");
      state.message="Something changed. "+st.name+".";
    }
    state.bumpUntil=performance.now()+240;
  }
  saveCreature();
}

function advanceHome(hours){
  if(!state.home||hours<=0)return;
  applyHomeHours(state.home,hours);
  state.home.lastRealMs=Date.now();
  state.worldNow=homeHours(state.home);
  passWorldTime(state.creature,hours);
  state.creature.worldSeenHours=state.worldNow;
  saveHome();
  saveCreature();
}

function homeTimeText(){
  const H=state.home||{day:1,hour:8};
  let h=Math.floor(H.hour),m=Math.round((H.hour-h)*60);
  if(m===60){h++;m=0}
  const ap=h>=12?"PM":"AM";
  const h12=h%12||12;
  return "Day "+H.day+" · "+h12+":"+String(m).padStart(2,"0")+" "+ap;
}

function selectHome(name){
  state.homeSelected=name;
  const copy={
    cottage:"A small place to sleep, plan, and keep the weather off your head.",
    garden:"Three rough beds. Crops advance whenever local home time moves.",
    patch:"Creature Zero lives on this same clock. No duplicate creature hiding here.",
    store:"Seeds, expedition finds, tools, and crafting materials live here.",
    trail:"Expeditions leave through here. The world keeps moving while you are gone."
  };
  state.homeMessage=copy[name]||"Home Clearing.";
}

function plantSeed(){
  const H=state.home;
  const i=H.crops.findIndex(v=>!v);
  if(i<0){state.homeMessage="All three beds already have something growing.";return}
  if(H.seeds<=0){state.homeMessage="The seed pouch is empty.";return}
  H.crops[i]=1;
  H.seeds--;
  advanceHome(.25);
  state.homeMessage="A seed settles into the bed. Fifteen local minutes pass.";
}

function waterBeds(){
  state.home.moist=Math.min(100,state.home.moist+30);
  advanceHome(.15);
  state.homeMessage="The beds darken with water.";
}

function restHome(hours){
  advanceHome(hours);
  state.homeMessage=hours>=8?"You rest. The clearing changes around you.":"An hour slips quietly past.";
}

function watchPatch(){
  advanceHome(.25);
  state.homeMessage="You sit beside the patch. Creature Zero is not impressed. Fifteen local minutes pass anyway.";
}

function scoutTrail(){
  advanceHome(2);
  state.homeMessage="You follow the trail until the clearing disappears behind the trees, then turn back.";
}

function checkStores(){
  const H=state.home,I=H.inventory||{};
  state.homeMessage="Seeds: "+(H.seeds||0)+" · Amber Resin: "+(I.resin||0)+" · Dewstone: "+(I.dewstone||0)+".";
}

function expeditionDefaults(){
  return {
    depth:0,
    time:0,
    vigor:3,
    loot:{wildSeed:0,resin:0,dewstone:0},
    finished:false,
    encounter:null,
    lastEncounter:null,
    battlePending:false,
    battleTested:false,
    eventTitle:"At the trailhead",
    eventText:"The clearing is still visible behind you. Somewhere ahead, the Hollow is dripping, ringing, growing."
  };
}

function saveExpedition(){
  const R=state.expedition;
  if(!R)return;
  if(R.finished)sessionStorage.removeItem(EXP_KEY);
  else sessionStorage.setItem(EXP_KEY,JSON.stringify(R));
}

function loadExpedition(){
  let R={};
  try{R=JSON.parse(sessionStorage.getItem(EXP_KEY)||"{}")}catch(e){}
  R={...expeditionDefaults(),...R,loot:{...expeditionDefaults().loot,...(R.loot||{})}};
  if(R.finished||R.depth>=5){
    sessionStorage.removeItem(EXP_KEY);
    R=expeditionDefaults();
  }
  state.expedition=R;
  consumeBattleResult();
  saveExpedition();
}

function lootName(k){
  return {wildSeed:"Wild Seed",resin:"Amber Resin",dewstone:"Dewstone"}[k]||k;
}

function expeditionLootText(){
  const R=state.expedition;
  const parts=[];
  for(const k of ["wildSeed","resin","dewstone"]){
    if(R.loot[k])parts.push(lootName(k)+" ×"+R.loot[k]);
  }
  return parts.length?parts.join(" · "):"Pack empty";
}

function randomExpeditionEncounterIndex(){
  const pool=EXP_ENCOUNTERS.map((e,i)=>i).filter(i=>EXP_ENCOUNTERS[i].title!==state.expedition.lastEncounter);
  return pool[Math.floor(Math.random()*pool.length)];
}

function beginExpeditionEncounter(){
  const R=state.expedition;
  if(!R||R.finished)return;

  if(stageFor(state.creature.growth).key==="budborn"&&!R.battleTested){
    R.battlePending=true;
    R.encounter={type:"battle"};
    R.eventTitle="Something moves in the bramble";
    R.eventText="A Bramblejaw steps onto the trail. Creature Zero is finally old enough to answer.";
    saveExpedition();
    return;
  }

  const index=randomExpeditionEncounterIndex();
  const e=EXP_ENCOUNTERS[index];
  R.encounter={type:"wild",index};
  R.lastEncounter=e.title;
  R.eventTitle=e.title;
  R.eventText=e.text;
  saveExpedition();
}

function avoidExpeditionBattle(){
  const R=state.expedition;
  R.battlePending=false;
  R.battleTested=true;
  R.time+=.4;
  R.encounter=null;
  R.eventTitle="You give it the trail";
  R.eventText="Bramblejaw watches you back away, then disappears into the brush.";
  saveExpedition();
}

function startBattle(){
  const R=state.expedition;
  R.battlePending=true;
  saveExpedition();
  state.battle=battleDefaults();
  goScene(3);
}

function resolveExpeditionChoice(choiceIndex){
  const R=state.expedition;
  if(!R||!R.encounter||R.encounter.type!=="wild")return;
  const e=EXP_ENCOUNTERS[R.encounter.index];
  const choice=e.choices[choiceIndex];
  if(!choice)return;

  R.time+=choice.time;
  let result=choice.result;

  if(choice.loot){
    R.loot[choice.loot]++;
    result+=" You gain "+lootName(choice.loot)+".";
  }
  if(choice.chanceLoot&&Math.random()<choice.chance){
    R.loot[choice.chanceLoot]++;
    result+=" You find "+lootName(choice.chanceLoot)+".";
  }
  if(choice.heal){
    const before=R.vigor;
    R.vigor=Math.min(3,R.vigor+choice.heal);
    if(R.vigor>before)result+=" Vigor restored.";
  }
  if(choice.risk&&Math.random()<choice.risk){
    R.vigor=Math.max(0,R.vigor-1);
    result+=" The shortcut costs 1 vigor.";
  }

  R.depth++;
  R.encounter=null;
  R.eventTitle=e.title+" · resolved";
  R.eventText=result;

  if(R.vigor<=0){
    finishExpedition(false,true);
    return;
  }

  if(R.depth>=5){
    R.loot.wildSeed++;
    R.eventTitle="The Heartroot cache";
    R.eventText="You reach a root-wrapped hollow full of old seed husks. One living seed remains. The expedition is complete.";
    finishExpedition(true,false);
    return;
  }

  saveExpedition();
}

function consumeBattleResult(){
  const R=state.expedition;
  if(!R||!R.battlePending)return;
  let B=null;
  try{B=JSON.parse(sessionStorage.getItem(BATTLE_RESULT_KEY)||"null")}catch(e){}
  if(!B)return;

  sessionStorage.removeItem(BATTLE_RESULT_KEY);
  R.battlePending=false;
  R.battleTested=true;
  R.encounter=null;
  R.time+=Number(B.trailTime)||0;
  if(B.loot&&B.loot.resin)R.loot.resin+=B.loot.resin;

  if(B.victory){
    R.depth++;
    R.eventTitle="Bramblejaw defeated";
    R.eventText="Creature Zero won its first battle. The trail opens again, and Amber Resin has been added to the pack.";
  }else if(B.mutual){
    R.vigor=Math.max(0,R.vigor-1);
    R.depth++;
    R.eventTitle="Both went down";
    R.eventText="Creature Zero dropped Bramblejaw but collapsed to its thorns. You recover the resin, lose 1 expedition vigor, and the trail is clear.";
  }else{
    R.vigor=Math.max(0,R.vigor-1);
    R.eventTitle="Bramblejaw held the trail";
    R.eventText="Creature Zero was forced back. The loss costs 1 expedition vigor, but the run is still alive.";
  }

  if(R.vigor<=0){
    finishExpedition(false,true);
    return;
  }
  if(R.depth>=5){
    R.loot.wildSeed++;
    R.eventTitle="The Heartroot cache";
    R.eventText="Beyond the battle, the root-wrapped cache waits. One living seed remains.";
    finishExpedition(true,false);
    return;
  }
  saveExpedition();
}

function finishExpedition(success,forced){
  const R=state.expedition;
  if(!R||R.finished)return;

  const factor=success?1:(forced?.25:.4);
  const passed=Math.max(.25,R.time*factor);

  advanceHome(passed);

  const H=state.home;
  if(!H.inventory)H.inventory={wildSeed:0,resin:0,dewstone:0};
  for(const k of Object.keys(R.loot)){
    H.inventory[k]=(H.inventory[k]||0)+R.loot[k];
  }
  if(R.loot.wildSeed)H.seeds=(H.seeds||0)+R.loot.wildSeed;
  H.lastExpedition={success,forced,trailTime:R.time,homeTime:passed,loot:{...R.loot},at:Date.now()};
  saveHome();

  R.finished=true;
  R.success=success;
  R.forced=forced;
  R.homeTime=passed;
  R.encounter=null;

  if(success){
    R.eventText+=" Home advances "+passed.toFixed(1)+" hours while you are away.";
  }else{
    R.eventTitle=forced?"Forced retreat":"Early retreat";
    R.eventText=(forced?"The Hollow takes the last of your expedition vigor.":"You decide the pack is worth more than another stretch.")+" Only "+passed.toFixed(1)+" hours pass back at home.";
  }
  saveExpedition();
}

function returnFromExpedition(){
  const R=state.expedition;
  if(!R.finished){
    finishExpedition(false,false);
    return;
  }
  state.expedition=expeditionDefaults();
  sessionStorage.removeItem(EXP_KEY);
  goScene(1);
}

const BATTLE_COMMAND=62;
const BATTLE_EXECUTE=100;
const BATTLE_ACTIONS={
  quick:{name:"Quick Strike",cast:.62,damage:5,contact:true},
  root:{name:"Root Bind",cast:1.18,damage:2,contact:false},
  brace:{name:"Brace",cast:.38,damage:0,contact:false},
  move:{name:"Move",cast:.55,damage:0,contact:false}
};

function battleDefaults(){
  return {
    ended:false,
    paused:false,
    result:null,
    logTitle:"Bramblejaw blocks the trail.",
    logText:"Creature Zero plants its root-feet. Neither side has committed yet.",
    P:{name:"Creature Zero",hp:28,maxHp:28,pos:0,speed:18,mode:"moving",action:null,shield:0,slow:1,hitUntil:0,lungeUntil:0,x:-2,y:1,moveFrom:null,moveTo:null},
    E:{name:"Bramblejaw",hp:24,maxHp:24,pos:9,speed:14,mode:"moving",action:null,shield:0,slow:1,hitUntil:0,lungeUntil:0,x:2,y:-1,moveFrom:null,moveTo:null}
  };
}

function battleLog(title,body){
  const B=state.battle;
  if(!B)return;
  B.logTitle=title;
  B.logText=body;
}

function enterBattleCommand(){
  const B=state.battle;
  if(!B||B.ended)return;
  B.P.pos=BATTLE_COMMAND;
  B.P.mode="command";
  B.paused=true;
  battleLog("COMMAND","Bramblejaw keeps moving only after you choose. Read where it is on the timeline.");
}

function battleEnemyChoose(){
  const B=state.battle;
  if(!B||B.ended)return;
  const heavy=Math.random()<.5;
  B.E.action=heavy
    ?{name:"Heavy Bloom",cast:1.55,damage:7,interrupt:12}
    :{name:"Thorn Swipe",cast:.82,damage:4,interrupt:7};
  if(heavy){
    B.E.moveFrom=null;B.E.moveTo=null;
  }else{
    const to=battleApproachPoint(B.E,B.P,1);
    const d=battleDist(B.E,to);
    B.E.action.cast=.50+d*.16;
    startActorMove(B.E,to);
  }
  B.E.mode="charging";
  B.E.pos=BATTLE_COMMAND;
  battleLog(
    "Bramblejaw prepares "+B.E.action.name+".",
    heavy
      ?"Its body swells with stored force. Interrupt it, bind it, or brace before ACTION."
      :"A quicker attack. Less room to react."
  );
}

function battleDist(a,b){
  return Math.hypot((a.x||0)-(b.x||0),(a.y||0)-(b.y||0));
}
function battleClampPoint(x,y){
  return {x:clamp(Math.round(x),-3,3),y:clamp(Math.round(y),-3,3)};
}
function battleApproachPoint(from,to,stop=1){
  const dx=from.x-to.x,dy=from.y-to.y;
  if(Math.abs(dx)>=Math.abs(dy))return battleClampPoint(to.x+(dx>=0?stop:-stop),to.y);
  return battleClampPoint(to.x,to.y+(dy>=0?stop:-stop));
}
function startActorMove(A,to){
  A.moveFrom={x:A.x,y:A.y};
  A.moveTo=battleClampPoint(to.x,to.y);
}
function clearActorMove(A){
  if(A.moveTo){A.x=A.moveTo.x;A.y=A.moveTo.y}
  A.moveFrom=null;A.moveTo=null;
}
function chooseBattleAction(kind){
  const B=state.battle;
  if(!B||B.ended||B.P.mode!=="command")return;

  if(kind==="move"){
    B.P.action={...BATTLE_ACTIONS.move};
    B.P.mode="targeting";
    B.paused=true;
    battleLog("MOVE","Tap anywhere inside the arena. Distance becomes preparation time.");
    return;
  }

  B.P.action={...BATTLE_ACTIONS[kind]};
  if(kind==="quick"){
    const to=battleApproachPoint(B.P,B.E,1);
    const d=battleDist(B.P,to);
    B.P.action.cast=.38+d*.18;
    startActorMove(B.P,to);
  }else{
    B.P.moveFrom=null;B.P.moveTo=null;
  }
  B.P.mode="charging";
  B.paused=false;
  battleLog(B.P.action.name+" selected.","Creature Zero still has to reach ACTION before it happens.");
}
function chooseBattleMoveTarget(x,y){
  const B=state.battle;
  if(!B||B.P.mode!=="targeting")return;
  const to=battleClampPoint(x,y);
  const d=Math.hypot(to.x-B.P.x,to.y-B.P.y);
  B.P.action={...BATTLE_ACTIONS.move,cast:.28+d*.22};
  startActorMove(B.P,to);
  B.P.mode="charging";
  B.paused=false;
  battleLog("Repositioning.","Creature Zero crosses the arena while both timelines keep moving.");
}

function executeBattlePlayer(){
  const B=state.battle;
  const P=B.P,E=B.E,a=P.action;
  P.mode="moving";P.action=null;P.pos=0;P.lungeUntil=performance.now()+260;
  clearActorMove(P);

  if(a.name==="Move"){
    battleLog("Creature Zero repositions.","A new angle, bought with timeline.");
    return;
  }

  if(a.name==="Brace"){
    P.shield=.55;
    P.hp=Math.min(P.maxHp,P.hp+1);
    battleLog("Creature Zero braces.","Leaves tuck tight. The next hit will be softened.");
    return;
  }

  E.hp=Math.max(0,E.hp-a.damage);
  E.hitUntil=performance.now()+280;
  let thorned=false;

  if(a.contact){
    P.hp=Math.max(0,P.hp-1);
    P.hitUntil=performance.now()+280;
    thorned=true;
  }

  if(a.name==="Quick Strike"&&E.mode==="charging"){
    E.mode="moving";
    E.action=null;
    E.pos=Math.max(18,E.pos-31);
    battleLog("Interrupt!","Quick Strike breaks Bramblejaw's action and knocks it backward."+(thorned?" Thorns prick Creature Zero for 1 damage.":""));
  }else if(a.name==="Root Bind"){
    E.slow=.62;
    if(E.mode==="charging"){
      E.mode="moving";
      E.action=null;
      E.pos=24;
      battleLog("Bound and cancelled.","Roots catch Bramblejaw mid-preparation and drag it backward. No contact, no thorn damage.");
    }else{
      E.pos=Math.max(8,E.pos-18);
      battleLog("Root Bind tightens.","Bramblejaw's next advance will be slower. The roots never touch its thorns.");
    }
  }else{
    battleLog(a.name+" lands.",a.damage+" damage."+(thorned?" Thorns deal 1 back.":""));
  }
  checkBattleEnd();
}

function executeBattleEnemy(){
  const B=state.battle;
  const P=B.P,E=B.E,a=E.action;
  E.mode="moving";E.action=null;E.pos=0;E.lungeUntil=performance.now()+260;
  clearActorMove(E);

  let dmg=a.damage;
  if(P.shield){
    dmg=Math.max(1,Math.round(dmg*(1-P.shield)));
    P.shield=0;
  }

  P.hp=Math.max(0,P.hp-dmg);
  P.hitUntil=performance.now()+280;
  if(P.mode==="charging"){
    P.pos=Math.max(BATTLE_COMMAND,P.pos-a.interrupt);
    battleLog(a.name+" lands.","Creature Zero takes "+dmg+" damage and loses some preparation.");
  }else{
    battleLog(a.name+" lands.","Creature Zero takes "+dmg+" damage.");
  }
  checkBattleEnd();
}

function checkBattleEnd(){
  const B=state.battle;
  if(B.E.hp<=0&&B.P.hp<=0)endBattle("mutual");
  else if(B.E.hp<=0)endBattle("victory");
  else if(B.P.hp<=0)endBattle("defeat");
}

function endBattle(outcome){
  const B=state.battle;
  if(!B||B.ended)return;
  B.ended=true;
  B.paused=true;

  const victory=outcome==="victory";
  const mutual=outcome==="mutual";
  B.result={
    victory,
    mutual,
    trailTime:victory?.7:(mutual?.6:.45),
    loot:(victory||mutual)?{resin:1}:{},
    at:Date.now()
  };

  battleLog(
    victory?"Bramblejaw yields the trail.":mutual?"A very prickly draw.":"Creature Zero is knocked back.",
    victory
      ?"Creature Zero wins its first fight. Amber Resin remains on the trail."
      :mutual
        ?"Bramblejaw falls, but its thorns take Creature Zero down too."
        :"Bramblejaw holds the trail. The expedition survives, but vigor will pay for it."
  );
}

function advanceBattleActor(A,dt,isPlayer){
  if(A.mode==="moving"){
    const slow=A.slow||1;
    A.pos+=A.speed*slow*dt;
    if(A.slow<1&&A.pos>=BATTLE_COMMAND)A.slow=1;
    if(A.pos>=BATTLE_COMMAND){
      if(isPlayer)enterBattleCommand();
      else battleEnemyChoose();
    }
  }else if(A.mode==="charging"){
    A.pos+=(BATTLE_EXECUTE-BATTLE_COMMAND)/A.action.cast*dt;
    if(A.moveFrom&&A.moveTo){
      const mt=clamp((A.pos-BATTLE_COMMAND)/(BATTLE_EXECUTE-BATTLE_COMMAND),0,1);
      const e=smoothstep(mt);
      A.x=lerp(A.moveFrom.x,A.moveTo.x,e);
      A.y=lerp(A.moveFrom.y,A.moveTo.y,e);
    }
    if(A.pos>=BATTLE_EXECUTE){
      A.pos=BATTLE_EXECUTE;
      if(isPlayer)executeBattlePlayer();
      else executeBattleEnemy();
    }
  }
}

function tickBattle(dt){
  const B=state.battle;
  if(!B||B.ended||B.paused||stageFor(state.creature.growth).key!=="budborn")return;
  advanceBattleActor(B.P,dt,true);
  advanceBattleActor(B.E,dt,false);
}

function returnBattleToExpedition(){
  const B=state.battle;
  if(!B||!B.ended||!B.result)return;
  sessionStorage.setItem(BATTLE_RESULT_KEY,JSON.stringify(B.result));
  consumeBattleResult();
  state.battle=null;
  goScene(2);
}

function battleActorPanel(panel,actor,isEnemy,now){
  let dx=0;
  if(actor.lungeUntil>now){
    const p=1-(actor.lungeUntil-now)/260;
    dx=Math.sin(clamp(p,0,1)*Math.PI)*(isEnemy?-20:20);
  }
  if(actor.hitUntil>now){
    const p=1-(actor.hitUntil-now)/280;
    dx+=Math.sin(p*Math.PI*5)*(isEnemy?5:-5);
  }
  return {...panel,x:panel.x+dx};
}

function hangout(){
  const S=state.creature;
  const since=state.worldNow-S.lastBondWorldHours;
  S.careStyle.social++;
  if(since>=.5){
    S.bond=clamp(S.bond+2,0,100);
    S.lastBondWorldHours=state.worldNow;
    remember("You spent quiet time together at the patch.");
    state.message=S.bond>=85?"Creature Zero settles beside you without being asked.":"Creature Zero watches you for a while, then inches closer.";
  }else state.message="Creature Zero seems content to just share the space for now.";
  state.bumpUntil=performance.now()+240;
  saveCreature();
}

function solveViewport(){
  const w=Math.max(1,window.innerWidth);
  const h=Math.max(1,window.innerHeight);
  const dpr=clamp(window.devicePixelRatio||1,1,3);
  state.view={w,h,dpr};

  canvas.width=Math.round(w*dpr);
  canvas.height=Math.round(h*dpr);
  canvas.style.width=w+"px";
  canvas.style.height=h+"px";
  ctx.setTransform(dpr,0,0,dpr,0,0);

  const aspect=w/h;
  state.W.layout=clamp((aspect-.58)/(1.65-.58),0,1);
}

function pointerPosition(e){
  const r=canvas.getBoundingClientRect();
  state.pointer.x=e.clientX-r.left;
  state.pointer.y=e.clientY-r.top;
}

function inside(p,r){
  return p.x>=r.x&&p.x<=r.x+r.w&&p.y>=r.y&&p.y<=r.y+r.h;
}
function buttonAt(p){
  for(let i=state.buttons.length-1;i>=0;i--){
    if(inside(p,state.buttons[i].rect))return state.buttons[i];
  }
  return null;
}

canvas.addEventListener("pointerdown",e=>{
  pointerPosition(e);
  state.pointer.down=true;
  const b=buttonAt(state.pointer);
  state.pressed=b?b.id:null;
  canvas.setPointerCapture?.(e.pointerId);
});
canvas.addEventListener("pointermove",pointerPosition);
canvas.addEventListener("pointerup",e=>{
  pointerPosition(e);
  const b=buttonAt(state.pointer);
  if(b&&b.id===state.pressed)b.action();
  state.pointer.down=false;
  state.pressed=null;
});
canvas.addEventListener("pointercancel",()=>{
  state.pointer.down=false;
  state.pressed=null;
});

function bar(r,label,value,size){
  text(label,r.x,r.y,{size,weight:760,color:"#a9b9aa"});
  text(Math.round(value)+"%",r.x+r.w,r.y,{size,weight:800,align:"right",color:"#dfe9d7"});
  const track={x:r.x,y:r.y+size+5,w:r.w,h:7};
  fillRound(track,"#ffffff14",4);
  const v=clamp(value,0,100);
  if(v>0){
    const fill={...track,w:Math.max(4,track.w*(v/100))};
    fillRound(fill,v<25?"#c9926d":"#8fc968",4);
  }
}

function drawButton(id,r,label,action,opt={}){
  const hot=state.pointer.down&&state.pressed===id&&inside(state.pointer,r);
  fillRound(r,hot?(opt.hot||"#bce77f"):(opt.fill||"#3c6048"),12);
  strokeRound(r,hot?"#efffc6":"#ffffff18",12,1);
  const size=fitText(label,r.w-18,{maxSize:opt.size||15,minSize:10,weight:850});
  text(label,r.x+r.w/2,r.y+r.h/2,{
    size,weight:850,align:"center",baseline:"middle",
    color:hot?"#102218":(opt.color||"#eef3df")
  });
  state.buttons.push({id,rect:{...r},action});
}

function drawLeaf(cx,cy,w,h,rot,color){
  ctx.save();
  ctx.translate(cx,cy);
  ctx.rotate(rot);
  ctx.beginPath();
  ctx.ellipse(0,0,w/2,h/2,0,0,Math.PI*2);
  ctx.fillStyle=color;
  ctx.fill();
  ctx.restore();
}

function drawCreature(panel,now,opt={}){
  const S=state.creature;
  const st=stageFor(S.growth);
  const s=Math.min(panel.w,panel.h);
  const cx=panel.x+panel.w/2;
  const ground=panel.y+panel.h*.78;
  const bump=now<state.bumpUntil?Math.sin((state.bumpUntil-now)/240*Math.PI)*-6:0;
  const sway=Math.sin(now/1200)*.025;

  ctx.save();
  ctx.translate(cx,ground+bump);
  ctx.rotate(sway);

  ctx.beginPath();
  ctx.ellipse(0,8,s*.27,s*.055,0,0,Math.PI*2);
  ctx.fillStyle="#503921";
  ctx.fill();

  if(st.key==="seed"){
    ctx.save();
    ctx.rotate(-.18);
    ctx.beginPath();
    ctx.ellipse(0,-s*.04,s*.09,s*.055,0,0,Math.PI*2);
    ctx.fillStyle="#79563a";
    ctx.fill();
    ctx.restore();
  }else{
    const mature=st.key==="youngling"||st.key==="budborn";
    if(mature){
      const bodyW=s*(st.key==="budborn"?.19:.15);
      const bodyH=s*(st.key==="budborn"?.17:.13);
      ctx.beginPath();
      ctx.ellipse(0,-bodyH*.35,bodyW,bodyH,0,0,Math.PI*2);
      ctx.fillStyle=S.dormant?"#687663":"#69a85c";
      ctx.fill();

      ctx.fillStyle="#102218";
      ctx.beginPath();ctx.ellipse(-bodyW*.32,-bodyH*.52,2.5,3.5,0,0,Math.PI*2);ctx.fill();
      ctx.beginPath();ctx.ellipse(bodyW*.32,-bodyH*.52,2.5,3.5,0,0,Math.PI*2);ctx.fill();

      ctx.strokeStyle="#27442d";
      ctx.lineWidth=4;
      ctx.beginPath();ctx.moveTo(-bodyW*.45,bodyH*.42);ctx.lineTo(-bodyW*.8,bodyH*.72);ctx.stroke();
      ctx.beginPath();ctx.moveTo(bodyW*.45,bodyH*.42);ctx.lineTo(bodyW*.8,bodyH*.72);ctx.stroke();
    }

    const stemBottom=mature?-s*.12:-s*.02;
    const stemTop=st.key==="sprout"?-s*.25:st.key==="shoot"?-s*.38:-s*.48;
    ctx.strokeStyle=S.dormant?"#687663":"#4e8f4c";
    ctx.lineWidth=Math.max(4,s*.025);
    ctx.lineCap="round";
    ctx.beginPath();ctx.moveTo(0,stemBottom);ctx.quadraticCurveTo(s*.02,stemTop*.55,0,stemTop);ctx.stroke();

    const leaf="#78b95d";
    drawLeaf(s*.07,stemTop+s*.07,s*.17,s*.075,-.5,leaf);
    drawLeaf(-s*.07,stemTop+s*.13,s*.16,s*.07,.55,leaf);
    if(st.key!=="sprout")drawLeaf(s*.08,stemTop+s*.19,s*.16,s*.07,.22,leaf);
    if(mature)drawLeaf(-s*.08,stemTop+s*.25,s*.15,s*.065,-.25,leaf);
  }
  ctx.restore();

  if(opt.labels!==false){
    text(st.name,panel.x+14,panel.y+12,{size:12,weight:850,color:"#dfe9d7"});
    text(mood(),panel.x+panel.w-14,panel.y+12,{size:11,weight:750,align:"right",color:"#91a796"});
  }
}

function musicThemeForScene(scene){
  return ["creature","home","expedition","battle"][clamp(Math.round(scene),0,3)];
}

function syncMusicTheme(scene=state.sceneTarget){
  window.BudborneMusic?.setTheme(musicThemeForScene(scene));
}

function goScene(target){
  state.sceneTarget=clamp(Number(target)||0,0,3);
  if(state.sceneTarget!==1)state.homeSelected=null;
  state.pressed=null;
  syncMusicTheme(state.sceneTarget);
}


const ISO_HOME_CELLS=[];
for(let y=-4;y<=4;y++)for(let x=-4;x<=4;x++){
  const water=(x===1&&y===1)||(x===2&&y===1)||(x===1&&y===2)||(x===2&&y===2)||(x===0&&y===2)||(x===2&&y===0);
  ISO_HOME_CELLS.push({x,y,k:water?"water":"grass"});
}
const ISO_HOME_OBJECTS=[
  {type:"cottage",x:-3,y:-3,foot:[[0,0],[1,0],[0,1],[1,1]]},
  {type:"store",x:2,y:-3,foot:[[0,0],[1,0],[0,1],[1,1]]},
  {type:"tree",x:-4,y:0},{type:"tree",x:4,y:-1},{type:"tree",x:3,y:3},
  {type:"rock",x:-2,y:3}
];
const ISO_GARDEN=[[-3,2],[-3,3],[-2,2],[-2,3]];
const isoKey=(x,y)=>x+","+y;
function isoHomeBlocked(x,y){
  const cell=ISO_HOME_CELLS.find(c=>c.x===x&&c.y===y);
  if(!cell||cell.k==="water")return true;
  if(ISO_HOME_OBJECTS.some(o=>(o.foot||[[0,0]]).some(([dx,dy])=>o.x+dx===x&&o.y+dy===y)))return true;
  return false;
}
function isoHomeRoute(sx,sy,tx,ty){
  const start=isoKey(sx,sy),goal=isoKey(tx,ty),q=[[sx,sy]],came=new Map([[start,null]]);
  for(let qi=0;qi<q.length;qi++){
    const [x,y]=q[qi]; if(isoKey(x,y)===goal)break;
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
      const nx=x+dx,ny=y+dy,k=isoKey(nx,ny);
      if(came.has(k)||isoHomeBlocked(nx,ny))continue;
      came.set(k,isoKey(x,y));q.push([nx,ny]);
    }
  }
  if(!came.has(goal))return [];
  const out=[];let k=goal;
  while(k!==start){const [x,y]=k.split(",").map(Number);out.push({x,y});k=came.get(k)}
  return out.reverse();
}
function isoHomeStep(){
  const M=state.isoHome;if(M.to||!M.path.length)return;
  M.from={x:M.x,y:M.y};M.to=M.path.shift();M.t=0;
}
function moveIsoHomeTo(x,y){
  if(isoHomeBlocked(x,y))return;
  const M=state.isoHome,sx=Math.round(M.x),sy=Math.round(M.y);
  M.path=isoHomeRoute(sx,sy,x,y);M.target={x,y};M.to=null;isoHomeStep();
}
function tickIsoHome(dt){
  const M=state.isoHome;if(!M.to){isoHomeStep();return}
  M.t+=dt*2.8;const t=clamp(M.t,0,1),e=smoothstep(t);
  M.x=lerp(M.from.x,M.to.x,e);M.y=lerp(M.from.y,M.to.y,e);
  if(t>=1){
    M.x=M.to.x;M.y=M.to.y;M.to=null;isoHomeStep();
    if(!M.to&&!M.path.length)isoHomeArrived(Math.round(M.x),Math.round(M.y));
  }
}
function isoHomeArrived(x,y){
  if((x===-3||x===-2)&&(y===-1||y===-2)){selectHome("cottage");return}
  if((x===2||x===3)&&(y===-1||y===-2)){selectHome("store");return}
  if(ISO_GARDEN.some(([gx,gy])=>Math.abs(gx-x)+Math.abs(gy-y)<=1)){selectHome("garden");return}
  if((x===-1||x===0)&&y<=-3){selectHome("trail");return}
  if(x===-2&&y===1){selectHome("patch");return}
  state.homeSelected=null;
}
function isoHomeGeom(area){
  const tw=clamp(Math.min(area.w*.155,area.h*.115),46,78),th=tw*.5;
  return {tw,th,ox:area.x+area.w*.50,oy:area.y+area.h*.40};
}
function isoPoint(G,x,y,z=0){return{x:G.ox+(x-y)*G.tw*.5,y:G.oy+(x+y)*G.th*.5-z*G.th}}
function isoDiamond(G,x,y,fill,stroke){
  const p=isoPoint(G,x,y),a={x:p.x,y:p.y-G.th*.5},b={x:p.x+G.tw*.5,y:p.y},d={x:p.x,y:p.y+G.th*.5},e={x:p.x-G.tw*.5,y:p.y};
  ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.lineTo(d.x,d.y);ctx.lineTo(e.x,e.y);ctx.closePath();
  ctx.fillStyle=fill;ctx.fill();ctx.strokeStyle=stroke;ctx.lineWidth=1;ctx.stroke();
}
function isoShadow(x,y,rx,ry){ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);ctx.fillStyle="#07100b66";ctx.fill()}
function drawIsoTree(G,o){
  const p=isoPoint(G,o.x,o.y);isoShadow(p.x,p.y+2,G.tw*.13,G.th*.09);
  ctx.fillStyle="#594a31";ctx.fillRect(p.x-3,p.y-G.th*.95,6,G.th);
  for(const [dx,dy,r] of [[0,-1.25,.30],[-.20,-1.03,.23],[.20,-1.02,.24]]){
    ctx.beginPath();ctx.arc(p.x+dx*G.tw,p.y+dy*G.th,r*G.tw,0,Math.PI*2);ctx.fillStyle=dy<-1.1?"#63824c":"#496b3e";ctx.fill();
  }
}
function drawIsoRock(G,o){
  const p=isoPoint(G,o.x,o.y);isoShadow(p.x,p.y+2,G.tw*.13,G.th*.08);
  ctx.beginPath();ctx.ellipse(p.x,p.y-G.th*.18,G.tw*.15,G.th*.24,-.12,0,Math.PI*2);ctx.fillStyle="#788078";ctx.fill();ctx.strokeStyle="#9aa49a";ctx.stroke();
}
function drawIsoBuilding(G,o,asset,label){
  const pts=(o.foot||[[0,0]]).map(([dx,dy])=>isoPoint(G,o.x+dx,o.y+dy));
  const cx=pts.reduce((s,p)=>s+p.x,0)/pts.length,cy=pts.reduce((s,p)=>s+p.y,0)/pts.length;
  const r={x:cx-G.tw*.72,y:cy-G.th*2.6,w:G.tw*1.44,h:G.th*2.5};
  if(!drawAssetContain(asset,r,{pad:0})){
    fillRound({x:cx-G.tw*.48,y:cy-G.th*1.45,w:G.tw*.96,h:G.th*1.35},"#5c4a32",6);
  }
  text(label,cx,cy+G.th*.38,{size:10,weight:850,align:"center",color:"#dfe9d7"});
}
function drawIsoHome(area,now,interactive){
  const G=isoHomeGeom(area),HH=state.home||{moist:0,crops:[0,0,0]};
  fillRound(area,"#10251a",20);strokeRound(area,"#ffffff12",20,1);
  ctx.save();rrPath(area.x,area.y,area.w,area.h,20);ctx.clip();
  for(const cell of [...ISO_HOME_CELLS].sort((a,b)=>(a.x+a.y)-(b.x+b.y))){
    const garden=ISO_GARDEN.some(([x,y])=>x===cell.x&&y===cell.y);
    const fill=cell.k==="water"?"#244f55":garden?"#65482c":"#557044";
    isoDiamond(G,cell.x,cell.y,fill,cell.k==="water"?"#477a72":"#78915b");
    if(cell.k==="water"){
      const p=isoPoint(G,cell.x,cell.y);
      ctx.strokeStyle="#8bbda655";ctx.beginPath();ctx.moveTo(p.x-G.tw*.22,p.y);ctx.quadraticCurveTo(p.x,p.y+2,p.x+G.tw*.22,p.y);ctx.stroke();
    }
    if(garden){
      const p=isoPoint(G,cell.x,cell.y),idx=ISO_GARDEN.findIndex(([x,y])=>x===cell.x&&y===cell.y)%3,crop=Number(HH.crops?.[idx])||0;
      if(crop>0){ctx.fillStyle="#79b95d";ctx.beginPath();ctx.arc(p.x,p.y-G.th*.18,3+Math.min(3,crop),0,Math.PI*2);ctx.fill()}
    }
  }
  const drawables=[...ISO_HOME_OBJECTS,{type:"bud",x:state.isoHome.x,y:state.isoHome.y}].sort((a,b)=>(a.x+a.y)-(b.x+b.y));
  for(const o of drawables){
    if(o.type==="tree")drawIsoTree(G,o);
    else if(o.type==="rock")drawIsoRock(G,o);
    else if(o.type==="cottage")drawIsoBuilding(G,o,ASSETS.cottage,"Cottage");
    else if(o.type==="store")drawIsoBuilding(G,o,ASSETS.store,"Storehouse");
    else{
      const p=isoPoint(G,o.x,o.y),s=G.tw*.55;
      drawCreature({x:p.x-s*.5,y:p.y-s*1.05,w:s,h:s},now,{labels:false});
    }
  }
  const trail=isoPoint(G,-.5,-3.5);
  const trailBack=isoPoint(G,-.5,-4.8);
  const trailRoad=isoPoint(G,-1.5,-3.5);
  const trailRoadBack=isoPoint(G,-1.5,-4.8);
  ctx.save();
  ctx.strokeStyle="#a98b5f";ctx.lineWidth=Math.max(8,G.tw*.18);ctx.lineCap="round";
  ctx.beginPath();ctx.moveTo(trailRoad.x,trailRoad.y+G.th*.30);ctx.lineTo(trailRoadBack.x,trailRoadBack.y);ctx.stroke();
  ctx.strokeStyle="#d1b77a66";ctx.lineWidth=Math.max(2,G.tw*.035);
  ctx.beginPath();ctx.moveTo(trailRoad.x,trailRoad.y+G.th*.30);ctx.lineTo(trailRoadBack.x,trailRoadBack.y);ctx.stroke();
  ctx.restore();

  // The original Wild Trail art now marks the world exit itself.
  const trailArt={x:trail.x-G.tw*.68,y:trail.y-G.th*2.55,w:G.tw*1.36,h:G.th*2.05};
  if(!drawAssetContain(ASSETS.trail,trailArt,{pad:0})){
    ctx.beginPath();ctx.arc(trail.x,trail.y-G.th*.10,Math.max(10,G.tw*.17),0,Math.PI*2);
    ctx.fillStyle="#1b3324";ctx.fill();ctx.strokeStyle="#a9db70";ctx.lineWidth=2;ctx.stroke();
    text("↑",trail.x,trail.y-G.th*.10,{size:15,weight:950,align:"center",baseline:"middle",color:"#dff6a9"});
  }
  text("Wild Trail",trail.x,trail.y-G.th*1.02,{size:11,weight:900,align:"center",color:"#d7e7b2"});
  const pond=isoPoint(G,1.3,1.3);text("Pond",pond.x,pond.y+G.th*.65,{size:10,weight:800,align:"center",color:"#9fc6b8"});
  ctx.restore();

  if(interactive){
    for(const cell of ISO_HOME_CELLS){
      const p=isoPoint(G,cell.x,cell.y);
      registerHit("iso-"+cell.x+"-"+cell.y,{x:p.x-G.tw*.46,y:p.y-G.th*.42,w:G.tw*.92,h:G.th*.84},()=>moveIsoHomeTo(cell.x,cell.y));
    }
    const hotspot=(id,x,y,tx,ty,w=1.15,h=1.25)=>{
      const p=isoPoint(G,x,y);
      registerHit(id,{x:p.x-G.tw*w*.5,y:p.y-G.th*h,w:G.tw*w,h:G.th*h*1.5},()=>moveIsoHomeTo(tx,ty));
    };
    hotspot("iso-cottage",-2.5,-2.5,-2,-1,1.8,2.4);
    hotspot("iso-store",2.5,-2.5,2,-1,1.8,2.4);
    hotspot("iso-garden",-2.5,2.5,-2,1,2.1,1.8);
    hotspot("iso-trail",-.5,-3.5,-1,-3,2.0,2.2);
    const bp=isoPoint(G,state.isoHome.x,state.isoHome.y);
    registerHit("iso-creature",{x:bp.x-G.tw*.4,y:bp.y-G.th*1.3,w:G.tw*.8,h:G.th*1.4},()=>selectHome("patch"));
  }
  text("Garden",area.x+14,area.y+area.h-27,{size:11,weight:850,color:"#cbb58b"});
  text("tap land or a place",area.x+area.w-14,area.y+area.h-27,{size:10,weight:700,align:"right",color:"#809486"});
}

function homeLayout(w,h,pad,contentY,contentH,W){
  const area={x:pad,y:contentY,w:w-pad*2,h:contentH};

  const portrait={
    cottage:{x:area.x,y:area.y,w:area.w*.48,h:area.h*.22},
    trail:{x:area.x+area.w*.52,y:area.y,w:area.w*.48,h:area.h*.22},
    store:{x:area.x+area.w*.52,y:area.y+area.h*.25,w:area.w*.48,h:area.h*.20},
    garden:{x:area.x,y:area.y+area.h*.48,w:area.w*.48,h:area.h*.52},
    patch:{x:area.x+area.w*.52,y:area.y+area.h*.48,w:area.w*.48,h:area.h*.52}
  };

  const wide={
    cottage:{x:area.x,y:area.y,w:area.w*.28,h:area.h*.42},
    trail:{x:area.x+area.w*.56,y:area.y,w:area.w*.44,h:area.h*.34},
    store:{x:area.x+area.w*.31,y:area.y+area.h*.18,w:area.w*.22,h:area.h*.45},
    garden:{x:area.x,y:area.y+area.h*.46,w:area.w*.28,h:area.h*.54},
    patch:{x:area.x+area.w*.56,y:area.y+area.h*.38,w:area.w*.44,h:area.h*.62}
  };

  return {
    cottage:mixRect(portrait.cottage,wide.cottage,W),
    trail:mixRect(portrait.trail,wide.trail,W),
    store:mixRect(portrait.store,wide.store,W),
    garden:mixRect(portrait.garden,wide.garden,W),
    patch:mixRect(portrait.patch,wide.patch,W)
  };
}

function drawHomeCard(r,title,subtitle,opt={}){
  const selected=state.homeSelected===opt.key;
  fillRound(r,selected?"#193323":(opt.fill||"#10251a"),18);
  strokeRound(r,selected?"#a9db70":"#ffffff12",18,selected?2:1);

  const size=fitText(title,r.w-20,{maxSize:14,minSize:10,weight:880});
  const ss=subtitle?fitText(subtitle,r.w-20,{maxSize:11,minSize:8,weight:650}):0;
  const labelH=subtitle?size+ss+18:size+14;

  if(opt.asset){
    const art={
      x:r.x+5,
      y:r.y+labelH,
      w:r.w-10,
      h:Math.max(8,r.h-labelH-5)
    };
    drawAssetContain(opt.asset,art,{pad:2});
  }

  text(title,r.x+12,r.y+11,{size,weight:880,color:"#eef3df"});
  if(subtitle){
    text(subtitle,r.x+12,r.y+13+size,{size:ss,weight:650,color:"#8fa394"});
  }
}

function registerHit(id,r,action){
  state.buttons.push({id,rect:{...r},action});
}

function drawGardenBeds(r){
  const top=r.y+r.h*.46;
  const left=r.x+r.w*.12;
  const bedW=r.w*.76;
  const bedH=Math.max(5,r.h*.07);
  for(let i=0;i<3;i++){
    const b={x:left,y:top+i*(bedH+6),w:bedW,h:bedH};
    fillRound(b,"#5b4127",4);
    const crop=state.home&&state.home.crops?Number(state.home.crops[i])||0:0;
    if(crop>0){
      const count=Math.min(5,Math.max(1,Math.ceil(crop)));
      for(let j=0;j<count;j++){
        const x=b.x+(j+1)*b.w/(count+1);
        ctx.beginPath();
        ctx.arc(x,b.y+b.h/2,Math.max(2,b.h*.22),0,Math.PI*2);
        ctx.fillStyle="#78b95d";
        ctx.fill();
      }
    }
  }
}

function drawHomeDrawer(w,h,pad,u){
  if(!state.homeSelected)return;

  const H=state.home||{seeds:0,moist:0,crops:[0,0,0],inventory:{}};
  const W=state.W.layout;
  const dh=clamp(lerp(25,42,W)*u,156,228);
  const dw=clamp(lerp(92,42,W)*u,280,w-pad*2);
  const r={
    x:W<.5?pad:w-pad-dw,
    y:h-pad-dh,
    w:W<.5?w-pad*2:dw,
    h:dh
  };

  fillRound(r,"#08150fee",18);
  strokeRound(r,"#ffffff22",18,1);

  const inner={x:r.x+14,y:r.y+13,w:r.w-28,h:r.h-26};
  const titles={cottage:"Cottage",garden:"Garden",patch:"Creature Patch",store:"Storehouse",trail:"Wild Trail"};
  const title=titles[state.homeSelected]||"Home Clearing";
  text(title,inner.x,inner.y,{size:clamp(3.3*u,12,17),weight:900,color:"#eef3df"});
  text("×",inner.x+inner.w,inner.y-2,{size:18,weight:900,align:"right",color:"#839889"});
  registerHit("drawer-close",{x:inner.x+inner.w-34,y:inner.y-8,w:38,h:36},()=>state.homeSelected=null);

  const msgSize=clamp(2.55*u,9,12);
  const msgLines=wrapText(state.homeMessage,inner.w,{size:msgSize,weight:650});
  msgLines.slice(0,3).forEach((line,i)=>text(line,inner.x,inner.y+28+i*msgSize*1.25,{
    size:msgSize,weight:650,color:"#9db09f"
  }));

  const statusY=r.y+r.h-78;
  text("Moisture "+Math.round(H.moist||0)+"% · Seeds "+(H.seeds||0),inner.x,statusY-19,{
    size:clamp(2.25*u,9,11),weight:700,color:"#718778"
  });

  const gap=8,bh=44,bw=(inner.w-gap)/2;
  const left={x:inner.x,y:statusY,w:bw,h:bh};
  const right={x:inner.x+bw+gap,y:statusY,w:bw,h:bh};

  if(state.homeSelected==="cottage"){
    drawButton("rest8",left,"Rest 8 hours",()=>restHome(8),{fill:"#496047",size:13});
    drawButton("pass1",right,"Pass 1 hour",()=>restHome(1),{fill:"#355641",size:13});
  }else if(state.homeSelected==="garden"){
    drawButton("plant",left,"Plant a seed",plantSeed,{fill:"#496047",size:13});
    drawButton("waterbeds",right,"Water beds",waterBeds,{fill:"#355641",size:13});
  }else if(state.homeSelected==="patch"){
    drawButton("visit",left,"Visit Creature",()=>goScene(0),{fill:"#496047",size:13});
    drawButton("watch",right,"Watch quietly",watchPatch,{fill:"#355641",size:13});
  }else if(state.homeSelected==="store"){
    drawButton("stores",left,"Check stores",checkStores,{fill:"#355641",size:13});
    drawButton("craft",right,"Crafting bench",()=>state.homeMessage="Nothing to craft yet. The bench exists mostly because future-you insisted.",{fill:"#24352b",size:12});
  }else if(state.homeSelected==="trail"){
    drawButton("expedition",left,"Enter Mossglass",()=>goScene(2),{fill:"#496047",size:13});
    drawButton("scout",right,"Scout nearby · 2h",scoutTrail,{fill:"#355641",size:12});
  }
}

function expeditionLayout(w,h,pad,contentY,contentH,W){
  const area={x:pad,y:contentY,w:w-pad*2,h:contentH};
  const portraitRoute={x:area.x,y:area.y,w:area.w,h:area.h*.46};
  const portraitInfo={x:area.x,y:area.y+area.h*.48,w:area.w,h:area.h*.52};
  const wideRoute={x:area.x,y:area.y,w:area.w*.54,h:area.h};
  const wideInfo={x:area.x+area.w*.56,y:area.y,w:area.w*.44,h:area.h};
  const route=mixRect(portraitRoute,wideRoute,W);
  const info=mixRect(portraitInfo,wideInfo,W);
  const companionPortrait={x:route.x+12,y:route.y+route.h*.55,w:route.w*.34,h:route.h*.39};
  const companionWide={x:route.x+12,y:route.y+route.h*.61,w:route.w*.40,h:route.h*.34};
  return {route,info,companion:mixRect(companionPortrait,companionWide,W)};
}


const EXP_PATH=[
  {x:-3,y:3},{x:-2,y:2},{x:-2,y:1},{x:-1,y:0},{x:0,y:-1},{x:1,y:-2}
];
const EXP_CELLS=[];
for(let y=-4;y<=4;y++)for(let x=-4;x<=4;x++){
  const stream=(x===2&&y>=-1&&y<=3)||(x===1&&y===3)||(x===3&&y===-1);
  EXP_CELLS.push({x,y,k:stream?"water":"moss"});
}
const EXP_OBJECTS=[
  {type:"glassTree",x:-4,y:1},{type:"glassTree",x:-3,y:-1},{type:"glassTree",x:3,y:1},
  {type:"glassTree",x:2,y:-3},{type:"glassTree",x:4,y:-2},{type:"glassTree",x:-1,y:-3},
  {type:"rock",x:-1,y:2},{type:"rock",x:3,y:3},
  {type:"thorn",x:1,y:0},{type:"thorn",x:0,y:-3}
];
function expeditionIsoGeom(r){
  const tw=clamp(Math.min(r.w*.145,r.h*.19),38,72),th=tw*.5;
  return {tw,th,ox:r.x+r.w*.49,oy:r.y+r.h*.53};
}
function expPathIndex(x,y){
  return EXP_PATH.findIndex(p=>p.x===x&&p.y===y);
}
function drawGlassTree(G,o,now){
  const p=isoPoint(G,o.x,o.y),s=G.tw;
  isoShadow(p.x,p.y+2,s*.13,G.th*.08);
  ctx.fillStyle="#4d4631";ctx.fillRect(p.x-3,p.y-G.th*1.05,6,G.th*1.1);
  const pulse=.96+Math.sin(now/900+o.x*1.7+o.y)*.035;
  ctx.save();ctx.translate(p.x,p.y-G.th*1.18);ctx.scale(pulse,pulse);
  for(const [dx,dy,r] of [[0,-.18,.28],[-.22,.03,.22],[.22,.04,.23],[0,.16,.21]]){
    ctx.beginPath();ctx.arc(dx*s,dy*s,r*s,0,Math.PI*2);
    ctx.fillStyle=dy<0?"#486f55":"#375f4d";ctx.fill();
    ctx.strokeStyle="#8db69a44";ctx.lineWidth=1;ctx.stroke();
  }
  ctx.restore();
}
function drawThornPatch(G,o){
  const p=isoPoint(G,o.x,o.y);
  ctx.save();ctx.strokeStyle="#7d9c54";ctx.lineWidth=Math.max(2,G.tw*.035);ctx.lineCap="round";
  for(let i=-2;i<=2;i++){
    ctx.beginPath();ctx.moveTo(p.x+i*4,p.y+3);ctx.quadraticCurveTo(p.x+i*6,p.y-G.th*.28,p.x+i*3,p.y-G.th*.47);ctx.stroke();
  }
  ctx.restore();
}
function drawMossglassWorld(r,R,now,interactive){
  fillRound(r,"#0b2118",20);strokeRound(r,"#ffffff14",20,1);
  const G=expeditionIsoGeom(r);
  ctx.save();rrPath(r.x,r.y,r.w,r.h,20);ctx.clip();

  // A dark, damp floor with the expedition path embedded in the terrain.
  for(const cell of [...EXP_CELLS].sort((a,b)=>(a.x+a.y)-(b.x+b.y))){
    const pi=expPathIndex(cell.x,cell.y);
    const passed=pi>=0&&pi<=R.depth;
    const fill=cell.k==="water"?"#183f45":pi>=0?(passed?"#516246":"#43523d"):"#334f3c";
    const stroke=cell.k==="water"?"#397067":"#58705a";
    isoDiamond(G,cell.x,cell.y,fill,stroke);
    const p=isoPoint(G,cell.x,cell.y);
    if(cell.k==="water"){
      ctx.strokeStyle="#8cb9a044";ctx.lineWidth=1.4;
      ctx.beginPath();ctx.moveTo(p.x-G.tw*.22,p.y);ctx.quadraticCurveTo(p.x,p.y+2,p.x+G.tw*.22,p.y);ctx.stroke();
    }else if(pi<0&&((cell.x*7+cell.y*11)&3)===0){
      ctx.fillStyle="#6c8c63aa";ctx.fillRect(p.x-1,p.y-G.th*.13,2,4);
    }
  }

  // Route itself reads as geography instead of a diagram.
  ctx.save();ctx.strokeStyle="#b69a6755";ctx.lineWidth=Math.max(5,G.tw*.10);ctx.lineCap="round";ctx.lineJoin="round";
  ctx.beginPath();
  EXP_PATH.forEach((q,i)=>{const p=isoPoint(G,q.x,q.y);if(i===0)ctx.moveTo(p.x,p.y);else ctx.lineTo(p.x,p.y)});
  ctx.stroke();ctx.restore();

  const drawables=[...EXP_OBJECTS].sort((a,b)=>(a.x+a.y)-(b.x+b.y));
  for(const o of drawables){
    if(o.type==="glassTree")drawGlassTree(G,o,now);
    else if(o.type==="rock")drawIsoRock(G,o);
    else drawThornPatch(G,o);
  }

  EXP_PATH.forEach((q,i)=>{
    const p=isoPoint(G,q.x,q.y);
    const done=i<R.depth,here=i===Math.min(R.depth,EXP_PATH.length-1),next=i===Math.min(R.depth+1,EXP_PATH.length-1)&&!R.encounter&&!R.finished;
    ctx.beginPath();ctx.arc(p.x,p.y-G.th*.10,here?8:next?7:5,0,Math.PI*2);
    ctx.fillStyle=here?"#e0c77c":done?"#91b56d":next?"#b9d77f":"#1a2e22";ctx.fill();
    ctx.strokeStyle=here?"#fff0b0":next?"#dff6a9":"#ffffff33";ctx.lineWidth=here||next?2:1;ctx.stroke();
    if(next){
      ctx.beginPath();ctx.arc(p.x,p.y-G.th*.10,12+Math.sin(now/170)*2,0,Math.PI*2);
      ctx.strokeStyle="#bce77f55";ctx.lineWidth=3;ctx.stroke();
    }
  });

  const here=EXP_PATH[Math.min(R.depth,EXP_PATH.length-1)];
  const hp=isoPoint(G,here.x,here.y);
  const s=G.tw*.50;
  drawCreature({x:hp.x-s*.5,y:hp.y-s*1.02,w:s,h:s},now,{labels:false});

  const entrance=isoPoint(G,EXP_PATH[0].x,EXP_PATH[0].y);
  text("Trailhead",entrance.x,entrance.y+G.th*.52,{size:9,weight:800,align:"center",color:"#9db09f"});
  const deep=isoPoint(G,EXP_PATH[5].x,EXP_PATH[5].y);
  text("deeper",deep.x,deep.y-G.th*.72,{size:9,weight:850,align:"center",color:"#9fb58f"});

  ctx.restore();

  text("Mossglass Hollow",r.x+14,r.y+12,{
    size:fitText("Mossglass Hollow",r.w-28,{maxSize:15,minSize:10,weight:900}),
    weight:900,color:"#eef3df"
  });

  if(interactive&&!R.finished&&!R.encounter&&R.depth<5){
    const next=EXP_PATH[Math.min(R.depth+1,5)],p=isoPoint(G,next.x,next.y);
    registerHit("exp-world-next",{x:p.x-G.tw*.45,y:p.y-G.th*.75,w:G.tw*.9,h:G.th*1.25},beginExpeditionEncounter);
  }
}

function drawMiniStat(r,label,value,size){
  fillRound(r,"#ffffff08",10);
  text(label,r.x+r.w/2,r.y+6,{size:size*.76,weight:700,align:"center",color:"#809486"});
  text(value,r.x+r.w/2,r.y+r.h-7,{size,weight:900,align:"center",baseline:"bottom",color:"#eef3df"});
}

function drawChoiceButton(id,r,choice,action){
  const hot=state.pointer.down&&state.pressed===id&&inside(state.pointer,r);
  fillRound(r,hot?"#bce77f":"#31503d",11);
  strokeRound(r,hot?"#efffc6":"#ffffff18",11,1);

  const labelSize=fitText(choice.label,r.w-16,{maxSize:13,minSize:9,weight:850});
  const hintSize=fitText(choice.hint||"",r.w-16,{maxSize:10,minSize:8,weight:650});
  text(choice.label,r.x+9,r.y+8,{size:labelSize,weight:850,color:hot?"#102218":"#eef3df"});
  if(choice.hint)text(choice.hint,r.x+9,r.y+r.h-8,{size:hintSize,weight:650,baseline:"bottom",color:hot?"#24452c":"#8fa394"});
  registerHit(id,r,action);
}

function drawExpeditionInfo(r,R,u,interactive){
  fillRound(r,"#0d1c14",20);
  strokeRound(r,"#ffffff14",20,1);

  const ip=clamp(3.2*u,10,16);
  const inner={x:r.x+ip,y:r.y+ip,w:r.w-ip*2,h:r.h-ip*2};
  const small=clamp(2.6*u,9,12);
  const statGap=6;
  const statH=clamp(8.2*u,31,39);
  const statW=(inner.w-statGap*2)/3;
  drawMiniStat({x:inner.x,y:inner.y,w:statW,h:statH},"Depth",R.depth+" / 5",small);
  drawMiniStat({x:inner.x+statW+statGap,y:inner.y,w:statW,h:statH},"Trail",R.time.toFixed(1)+"h",small);
  drawMiniStat({x:inner.x+(statW+statGap)*2,y:inner.y,w:statW,h:statH},"Vigor",R.vigor+" ♥",small);

  const logY=inner.y+statH+8;
  const logH=clamp(lerp(16,29,state.W.layout)*u,82,105);
  const logR={x:inner.x,y:logY,w:inner.w,h:logH};
  fillRound(logR,"#07130d",12);
  strokeRound(logR,"#ffffff10",12,1);

  const titleSize=fitText(R.eventTitle||"Mossglass Hollow",logR.w-20,{maxSize:13,minSize:9,weight:900});
  text(R.eventTitle||"Mossglass Hollow",logR.x+10,logR.y+9,{size:titleSize,weight:900,color:"#eef3df"});

  const bodySize=clamp(2.25*u,8.5,11);
  const lines=wrapText(R.eventText||"",logR.w-20,{size:bodySize,weight:650});
  const lineH=bodySize*1.22;
  lines.slice(0,4).forEach((line,i)=>text(line,logR.x+10,logR.y+27+i*lineH,{
    size:bodySize,weight:650,color:"#94a797"
  }));

  text(expeditionLootText(),logR.x+10,logR.y+logR.h-8,{
    size:fitText(expeditionLootText(),logR.w-20,{maxSize:9,minSize:7.5,weight:750}),
    weight:750,baseline:"bottom",color:"#c1d2b9"
  });

  if(!interactive)return;

  const actionTop=logR.y+logR.h+8;
  const available=Math.max(42,inner.y+inner.h-actionTop);

  if(R.finished){
    drawButton("exp-return",{x:inner.x,y:inner.y+inner.h-44,w:inner.w,h:44},"🏡 Return to clearing",returnFromExpedition,{fill:"#41614c",size:13});
    return;
  }

  if(R.encounter&&R.encounter.type==="battle"){
    const gap=7,bh=Math.min(48,available);
    const half=(inner.w-gap)/2;
    drawButton("battle-go",{x:inner.x,y:inner.y+inner.h-bh,w:half,h:bh},"Stand ground",startBattle,{fill:"#5b4638",size:12});
    drawButton("battle-back",{x:inner.x+half+gap,y:inner.y+inner.h-bh,w:half,h:bh},"Back away",avoidExpeditionBattle,{fill:"#355641",size:12});
    return;
  }

  if(R.encounter&&R.encounter.type==="wild"){
    const e=EXP_ENCOUNTERS[R.encounter.index];
    const gap=6;
    if(state.W.layout<.5){
      const bh=Math.min(43,(available-gap*2)/3);
      const start=inner.y+inner.h-(bh*3+gap*2);
      e.choices.forEach((choice,i)=>drawChoiceButton(
        "choice-"+i,
        {x:inner.x,y:start+i*(bh+gap),w:inner.w,h:bh},
        choice,
        ()=>resolveExpeditionChoice(i)
      ));
    }else{
      const bw=(inner.w-gap*2)/3;
      const bh=Math.min(52,available);
      const y=inner.y+inner.h-bh;
      e.choices.forEach((choice,i)=>drawChoiceButton(
        "choice-"+i,
        {x:inner.x+i*(bw+gap),y,w:bw,h:bh},
        choice,
        ()=>resolveExpeditionChoice(i)
      ));
    }
    return;
  }

  const gap=7,bh=Math.min(46,available);
  const half=(inner.w-gap)/2;
  drawButton("exp-advance",{x:inner.x,y:inner.y+inner.h-bh,w:half,h:bh},R.depth?"Enter stretch "+(R.depth+1):"Enter first stretch",beginExpeditionEncounter,{fill:"#496047",size:12});
  drawButton("exp-retreat",{x:inner.x+half+gap,y:inner.y+inner.h-bh,w:half,h:bh},"Return home",returnFromExpedition,{fill:"#355641",size:12});
}

function battleLayout(w,h,pad,contentY,contentH,W){
  const area={x:pad,y:contentY,w:w-pad*2,h:contentH};
  const portraitArena={x:area.x,y:area.y,w:area.w,h:area.h*.49};
  const portraitInfo={x:area.x,y:area.y+area.h*.51,w:area.w,h:area.h*.49};
  const wideArena={x:area.x,y:area.y,w:area.w*.48,h:area.h};
  const wideInfo={x:area.x+area.w*.50,y:area.y,w:area.w*.50,h:area.h};
  const arena=mixRect(portraitArena,wideArena,W);
  const info=mixRect(portraitInfo,wideInfo,W);

  const playerPortrait={x:arena.x+arena.w*.04,y:arena.y+arena.h*.29,w:arena.w*.43,h:arena.h*.64};
  const enemyPortrait={x:arena.x+arena.w*.53,y:arena.y+arena.h*.29,w:arena.w*.43,h:arena.h*.64};
  const playerWide={x:arena.x+arena.w*.04,y:arena.y+arena.h*.35,w:arena.w*.43,h:arena.h*.55};
  const enemyWide={x:arena.x+arena.w*.53,y:arena.y+arena.h*.35,w:arena.w*.43,h:arena.h*.55};

  return {
    arena,info,
    player:mixRect(playerPortrait,playerWide,W),
    enemy:mixRect(enemyPortrait,enemyWide,W)
  };
}

function drawBattleHp(r,value,max,color){
  const track={x:r.x,y:r.y,w:r.w,h:7};
  fillRound(track,"#ffffff14",4);
  const pct=clamp(value/max,0,1);
  if(pct>0)fillRound({...track,w:Math.max(4,track.w*pct)},color,4);
}

function drawBramblejaw(panel,B,now){
  const E=B.E;
  const heavy=E.mode==="charging"&&E.action&&E.action.name==="Heavy Bloom";
  const p=battleActorPanel(panel,E,true,now);
  const s=Math.min(p.w,p.h);
  const cx=p.x+p.w/2;
  const cy=p.y+p.h*.57;
  const pulse=heavy?1+Math.sin(now/105)*.055:1;

  if(heavy){
    ctx.beginPath();
    ctx.arc(cx,cy,s*.24+Math.sin(now/120)*5,0,Math.PI*2);
    ctx.strokeStyle="#e5ca7866";
    ctx.lineWidth=6;
    ctx.stroke();
    text("HEAVY BLOOM",cx,p.y+6,{
      size:fitText("HEAVY BLOOM",p.w-16,{maxSize:11,minSize:8,weight:950}),
      weight:950,align:"center",color:"#f3d987"
    });
  }

  ctx.save();
  ctx.translate(cx,cy);
  ctx.scale(pulse,pulse);

  ctx.fillStyle="#6e8f47";
  ctx.beginPath();
  ctx.ellipse(0,0,s*.18,s*.26,0,0,Math.PI*2);
  ctx.fill();

  ctx.strokeStyle="#5c7c3b";
  ctx.lineWidth=Math.max(5,s*.035);
  ctx.lineCap="round";
  ctx.beginPath();ctx.moveTo(-s*.12,-s*.02);ctx.lineTo(-s*.26,-s*.10);ctx.lineTo(-s*.28,-s*.22);ctx.stroke();
  ctx.beginPath();ctx.moveTo(s*.12,s*.01);ctx.lineTo(s*.25,-s*.05);ctx.lineTo(s*.27,-s*.18);ctx.stroke();

  ctx.fillStyle="#102218";
  ctx.beginPath();ctx.arc(-s*.055,-s*.045,2.6,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.arc(s*.055,-s*.045,2.6,0,Math.PI*2);ctx.fill();

  ctx.strokeStyle="#d7c59b";
  ctx.lineWidth=1.4;
  for(const a of [-2.7,-2.1,-1.55,-1.05,-.45,.1,.65,1.15,1.7,2.3]){
    const x=Math.cos(a)*s*.17,y=Math.sin(a)*s*.23;
    ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+Math.cos(a)*7,y+Math.sin(a)*7);ctx.stroke();
  }
  ctx.restore();

  text("Bramblejaw",p.x+p.w/2,p.y+p.h-40,{
    size:fitText("Bramblejaw",p.w-16,{maxSize:12,minSize:9,weight:900}),
    weight:900,align:"center",color:"#eef3df"
  });
  text("Thorns · contact +1",p.x+p.w/2,p.y+p.h-25,{
    size:fitText("Thorns · contact +1",p.w-16,{maxSize:9,minSize:7,weight:750}),
    weight:750,align:"center",color:"#d9b28b"
  });
}

function battleArenaGeom(r){
  const tw=clamp(Math.min(r.w*.17,r.h*.145),42,72),th=tw*.5;
  return {tw,th,ox:r.x+r.w*.50,oy:r.y+r.h*.46};
}
function battleWorldToScreen(r,x,y){
  const G=battleArenaGeom(r);
  return {x:G.ox+(x-y)*G.tw*.5,y:G.oy+(x+y)*G.th*.5};
}
function battleScreenToWorld(r,sx,sy){
  const G=battleArenaGeom(r);
  const a=(sx-G.ox)/(G.tw*.5),b=(sy-G.oy)/(G.th*.5);
  return battleClampPoint((a+b)/2,(b-a)/2);
}
function battleActorRect(r,A){
  const G=battleArenaGeom(r),p=battleWorldToScreen(r,A.x||0,A.y||0);
  const s=G.tw*.82;
  return {x:p.x-s*.5,y:p.y-s*.86,w:s,h:s};
}
function battleTileDistance(a,b){
  return Math.hypot((a.x||0)-(b.x||0),(a.y||0)-(b.y||0));
}
function drawBattleArena(r,B,playerPanel,enemyPanel,now,interactive=false){
  fillRound(r,"#0b2118",20);
  strokeRound(r,"#ffffff14",20,1);

  const G=battleArenaGeom(r);
  ctx.save();rrPath(r.x,r.y,r.w,r.h,20);ctx.clip();

  // Classic isometric battle floor. The tiles are now the arena.
  for(let y=-3;y<=3;y++){
    for(let x=-3;x<=3;x++){
      const p=battleWorldToScreen(r,x,y);
      const edge=Math.max(Math.abs(x),Math.abs(y))===3;
      let fill=edge?"#3f533a":"#4b613f";
      let stroke=edge?"#708064":"#7d8e6e";

      const heavy=B.E.mode==="charging"&&B.E.action&&B.E.action.name==="Heavy Bloom";
      if(heavy&&Math.hypot(x-B.E.x,y-B.E.y)<=1.5){
        fill="#6a5b37";
        stroke="#d8bf6d";
      }
      if(B.P.mode==="targeting"){
        fill=edge?"#486144":"#58744a";
        stroke="#a7c984";
      }
      isoDiamond(G,x,y,fill,stroke);
      if(B.P.mode==="targeting"){
        ctx.beginPath();ctx.arc(p.x,p.y,2.4,0,Math.PI*2);
        ctx.fillStyle="#dff6a988";ctx.fill();
      }
    }
  }

  // Reuse Mossglass vocabulary around the battle floor.
  const scenery=[
    {type:"glassTree",x:-3,y:-3},{type:"glassTree",x:3,y:2},
    {type:"rock",x:3,y:-3},{type:"rock",x:-2,y:3},
    {type:"thorn",x:2,y:3},{type:"thorn",x:-3,y:1}
  ];
  for(const o of scenery.sort((a,b)=>(a.x+a.y)-(b.x+b.y))){
    if(o.type==="glassTree")drawGlassTree(G,o,now);
    else if(o.type==="rock")drawIsoRock(G,o);
    else drawThornPatch(G,o);
  }

  const heavy=B.E.mode==="charging"&&B.E.action&&B.E.action.name==="Heavy Bloom";
  if(heavy){
    const ep=battleWorldToScreen(r,B.E.x,B.E.y);
    text("HEAVY BLOOM",ep.x,ep.y-G.th*2.1,{size:10,weight:950,align:"center",color:"#f3d987"});
  }

  let pr=battleActorRect(r,B.P);
  let er=battleActorRect(r,B.E);
  pr=battleActorPanel(pr,B.P,false,now);
  er=battleActorPanel(er,B.E,true,now);

  const actors=[
    {kind:"P",rect:pr,foot:pr.y+pr.h},
    {kind:"E",rect:er,foot:er.y+er.h}
  ].sort((a,b)=>a.foot-b.foot);
  for(const a of actors){
    if(a.kind==="P")drawCreature(a.rect,now,{labels:false});
    else drawBramblejaw(a.rect,B,now);
  }

  text("Creature Zero",pr.x+pr.w/2,pr.y+pr.h-22,{
    size:fitText("Creature Zero",pr.w-10,{maxSize:9.5,minSize:7,weight:900}),
    weight:900,align:"center",color:"#eef3df"
  });

  const hpPad=5;
  drawBattleHp({x:pr.x+hpPad,y:pr.y+pr.h-6,w:Math.max(20,pr.w-hpPad*2),h:7},B.P.hp,B.P.maxHp,"#8fc968");
  drawBattleHp({x:er.x+hpPad,y:er.y+er.h-6,w:Math.max(20,er.w-hpPad*2),h:7},B.E.hp,B.E.maxHp,"#c98768");

  ctx.restore();

  if(B.P.mode==="targeting"){
    text("Choose a tile",r.x+r.w/2,r.y+12,{size:10,weight:850,align:"center",color:"#dff6a9"});
  }

  if(interactive&&B.P.mode==="targeting"){
    registerHit("battle-arena-move",r,()=>{
      const p=battleScreenToWorld(r,state.pointer.x,state.pointer.y);
      chooseBattleMoveTarget(p.x,p.y);
    });
  }
}

function drawBattleTimeline(r,B,u){
  fillRound(r,"#07120d",12);
  strokeRound(r,"#ffffff12",12,1);

  const top=r.y+18;
  const lineY=r.y+r.h*.56;
  const left=r.x+12,right=r.x+r.w-12;
  const width=right-left;
  const commandX=left+width*(BATTLE_COMMAND/100);

  text("READY",left,r.y+5,{size:8,weight:800,color:"#829689"});
  text("COMMAND",commandX,r.y+5,{size:8,weight:900,align:"center",color:"#e5ca78"});
  text("ACTION",right,r.y+5,{size:8,weight:800,align:"right",color:"#829689"});

  ctx.beginPath();ctx.moveTo(left,lineY);ctx.lineTo(right,lineY);
  ctx.strokeStyle="#ffffff20";ctx.lineWidth=2;ctx.stroke();
  ctx.beginPath();ctx.moveTo(commandX,top);ctx.lineTo(commandX,r.y+r.h-8);
  ctx.strokeStyle="#e5ca7866";ctx.lineWidth=1;ctx.stroke();

  const heavy=B.E.mode==="charging"&&B.E.action&&B.E.action.name==="Heavy Bloom";
  const marker=(A,y,enemy=false)=>{
    const x=left+width*(clamp(A.pos,0,100)/100);
    ctx.beginPath();ctx.arc(x,y,12,0,Math.PI*2);
    ctx.fillStyle=enemy?"#5b372c":"#325a3b";ctx.fill();
    ctx.lineWidth=A.mode==="charging"?3:2;
    ctx.strokeStyle=(heavy&&enemy)?"#e5ca78":A.mode==="charging"?"#e5ca78":enemy?"#c98768":"#a9db70";
    ctx.stroke();
    text(enemy?"✹":"🌿",x,y,{size:10,weight:900,align:"center",baseline:"middle",color:"#eef3df"});
  };
  marker(B.P,lineY-9,false);
  marker(B.E,lineY+11,true);
}

function drawBattleCommand(id,r,label,hint,fill,action,enabled){
  const hot=enabled&&state.pointer.down&&state.pressed===id&&inside(state.pointer,r);
  fillRound(r,enabled?(hot?"#bce77f":fill):"#26332b",11);
  strokeRound(r,enabled?(hot?"#efffc6":"#ffffff18"):"#ffffff0d",11,1);
  const labelSize=fitText(label,r.w-16,{maxSize:12,minSize:9,weight:900});
  const hintSize=fitText(hint,r.w-16,{maxSize:8.5,minSize:7,weight:650});
  text(label,r.x+9,r.y+7,{size:labelSize,weight:900,color:enabled?(hot?"#102218":"#eef3df"):"#748077"});
  text(hint,r.x+9,r.y+r.h-7,{size:hintSize,weight:650,baseline:"bottom",color:enabled?(hot?"#24452c":"#8fa394"):"#5c665f"});
  if(enabled)registerHit(id,r,action);
}

function drawBattleInfo(r,B,u,interactive){
  fillRound(r,"#0d1c14",20);
  strokeRound(r,"#ffffff14",20,1);
  const ip=clamp(3*u,10,15);
  const inner={x:r.x+ip,y:r.y+ip,w:r.w-ip*2,h:r.h-ip*2};

  const timelineH=clamp(13*u,58,72);
  const timelineR={x:inner.x,y:inner.y,w:inner.w,h:timelineH};
  drawBattleTimeline(timelineR,B,u);

  const statusY=timelineR.y+timelineR.h+6;
  const statusH=34,gap=6,half=(inner.w-gap)/2;
  const ps={x:inner.x,y:statusY,w:half,h:statusH};
  const es={x:inner.x+half+gap,y:statusY,w:half,h:statusH};
  fillRound(ps,"#ffffff08",9);fillRound(es,"#ffffff08",9);

  const pStatus=B.P.mode==="command"?"Choose":B.P.mode==="charging"?B.P.action.name+"…":"Advancing";
  const eStatus=B.E.mode==="charging"?B.E.action.name+"…":"Advancing";
  text("Creature Zero",ps.x+8,ps.y+5,{size:8,weight:700,color:"#829689"});
  text(pStatus,ps.x+8,ps.y+18,{size:fitText(pStatus,ps.w-16,{maxSize:10,minSize:8,weight:850}),weight:850,color:"#eef3df"});
  text("Bramblejaw",es.x+8,es.y+5,{size:8,weight:700,color:"#829689"});
  text(eStatus,es.x+8,es.y+18,{size:fitText(eStatus,es.w-16,{maxSize:10,minSize:8,weight:850}),weight:850,color:"#eef3df"});

  const logY=statusY+statusH+7;
  const logH=clamp(lerp(14,25,state.W.layout)*u,72,92);
  const logR={x:inner.x,y:logY,w:inner.w,h:logH};
  fillRound(logR,"#07120d",11);
  strokeRound(logR,"#ffffff10",11,1);

  const titleSize=fitText(B.logTitle,logR.w-18,{maxSize:12,minSize:8.5,weight:900});
  text(B.logTitle,logR.x+9,logR.y+8,{size:titleSize,weight:900,color:"#eef3df"});
  const bodySize=clamp(2.1*u,8,10.5);
  const lines=wrapText(B.logText,logR.w-18,{size:bodySize,weight:650});
  lines.slice(0,4).forEach((line,i)=>text(line,logR.x+9,logR.y+27+i*bodySize*1.2,{
    size:bodySize,weight:650,color:"#94a797"
  }));

  const actionTop=logR.y+logR.h+7;
  const available=Math.max(42,inner.y+inner.h-actionTop);

  if(B.ended){
    drawButton("battle-return",{x:inner.x,y:inner.y+inner.h-44,w:inner.w,h:44},"Return to Mossglass",returnBattleToExpedition,{fill:"#496047",size:13});
    return;
  }

  const canChoose=interactive&&B.P.mode==="command";
  const cmds=[
    ["quick","Quick Strike","approach · 5 dmg · contact","#789b58"],
    ["root","Root Bind","ranged · cancel · slow","#47754d"],
    ["brace","Brace","reduce next hit · +1 HP","#3b5144"],
    ["move","Move","tap arena · distance costs time","#405d52"]
  ];

  if(state.W.layout<.5){
    const gap=6;
    const bw=(inner.w-gap)/2;
    const bh=Math.min(46,(available-gap)/2);
    const start=inner.y+inner.h-(bh*2+gap);
    cmds.forEach((cmd,i)=>drawBattleCommand(
      "cmd-"+cmd[0],
      {x:inner.x+(i%2)*(bw+gap),y:start+Math.floor(i/2)*(bh+gap),w:bw,h:bh},
      cmd[1],cmd[2],cmd[3],()=>chooseBattleAction(cmd[0]),canChoose
    ));
  }else{
    const bw=(inner.w-18)/4;
    const bh=Math.min(50,available);
    const y=inner.y+inner.h-bh;
    cmds.forEach((cmd,i)=>drawBattleCommand(
      "cmd-"+cmd[0],{x:inner.x+i*(bw+6),y,w:bw,h:bh},
      cmd[1],cmd[2],cmd[3],()=>chooseBattleAction(cmd[0]),canChoose
    ));
  }
}

function drawCarePanel(infoPanel,u,interactive){
  const S=state.creature;
  fillRound(infoPanel,"#0d1c14",20);
  strokeRound(infoPanel,"#ffffff12",20,1);

  const ip=clamp(3.4*u,11,18);
  const inner={
    x:infoPanel.x+ip,
    y:infoPanel.y+ip,
    w:infoPanel.w-ip*2,
    h:infoPanel.h-ip*2
  };

  const small=clamp(2.8*u,10,13);
  const barH=small+14;
  let y=inner.y;

  bar({x:inner.x,y,w:inner.w,h:barH},"Water",S.water,small);y+=barH+5;
  bar({x:inner.x,y,w:inner.w,h:barH},"Light",S.sun,small);y+=barH+5;
  bar({x:inner.x,y,w:inner.w,h:barH},"Health",S.health,small);y+=barH+8;

  const st=stageFor(S.growth);
  const growthPct=st.next?((S.growth-st.min)/(st.next-st.min))*100:100;
  bar({x:inner.x,y,w:inner.w,h:barH},"Growth",growthPct,small);y+=barH+8;

  const statH=clamp(8*u,28,36);
  const statGap=7;
  const statW=(inner.w-statGap)/2;
  const careR={x:inner.x,y,w:statW,h:statH};
  const bondR={x:inner.x+statW+statGap,y,w:statW,h:statH};
  fillRound(careR,"#ffffff09",10);fillRound(bondR,"#ffffff09",10);
  text("Care "+Math.round(S.care),careR.x+careR.w/2,careR.y+careR.h/2,{size:small,weight:800,align:"center",baseline:"middle",color:"#c9d5c8"});
  text("Bond "+Math.round(S.bond),bondR.x+bondR.w/2,bondR.y+bondR.h/2,{size:small,weight:800,align:"center",baseline:"middle",color:"#c9d5c8"});
  y+=statH+8;

  const buttonH=clamp(10*u,38,48);
  const buttonGap=7;
  const msgSpace=Math.max(24,inner.y+inner.h-y-(buttonH*2+buttonGap*2));
  const msgSize=clamp(2.65*u,10,13);
  const lines=wrapText(state.message,inner.w,{size:msgSize,weight:650});
  const lineH=msgSize*1.2;
  const maxLines=Math.max(1,Math.floor(msgSpace/lineH));
  lines.slice(0,maxLines).forEach((line,i)=>text(line,inner.x+inner.w/2,y+i*lineH,{
    size:msgSize,weight:650,align:"center",color:"#95aa99"
  }));

  const actionY=inner.y+inner.h-buttonH*2-buttonGap;
  const half=(inner.w-buttonGap)/2;

  if(interactive){
    drawButton("water",{x:inner.x,y:actionY,w:half,h:buttonH},"💧 Water",()=>care("water"),{fill:"#41614c"});
    drawButton("sun",{x:inner.x+half+buttonGap,y:actionY,w:half,h:buttonH},"☀️ Sun",()=>care("sun"),{fill:"#5a6140"});
    drawButton("hangout",{x:inner.x,y:actionY+buttonH+buttonGap,w:inner.w,h:buttonH},"🌿 Spend time together",hangout,{fill:"#31503d"});
  }else{
    fillRound({x:inner.x,y:actionY,w:half,h:buttonH},"#41614c",12);
    fillRound({x:inner.x+half+buttonGap,y:actionY,w:half,h:buttonH},"#5a6140",12);
    fillRound({x:inner.x,y:actionY+buttonH+buttonGap,w:inner.w,h:buttonH},"#31503d",12);
  }
}

function draw(){
  const {w,h}=state.view;
  const W=state.W.layout;
  const now=performance.now();
  const dtMs=Math.min(50,Math.max(0,now-state.lastFrame));
  state.lastFrame=now;

  const sceneStep=dtMs/720;
  if(state.W.scene<state.sceneTarget)state.W.scene=Math.min(state.sceneTarget,state.W.scene+sceneStep);
  else if(state.W.scene>state.sceneTarget)state.W.scene=Math.max(state.sceneTarget,state.W.scene-sceneStep);

  const H=smoothstep(clamp(state.W.scene,0,1));
  const E=smoothstep(clamp(state.W.scene-1,0,1));
  const B=smoothstep(clamp(state.W.scene-2,0,1));
  const creatureAlpha=1-H;
  const homeAlpha=H*(1-E);
  const expeditionAlpha=E*(1-B);
  const battleAlpha=B;

  if(state.W.scene>2.985&&state.sceneTarget===3)tickBattle(dtMs/1000);
  if(Math.abs(state.W.scene-1)<.08&&state.sceneTarget===1)tickIsoHome(dtMs/1000);

  const u=Math.min(w,h)/100;
  const pad=clamp(3.5*u,12,22);
  const headerH=clamp(13*u,52,68);
  const contentY=headerH+pad*.2;
  const contentH=h-contentY-pad;

  ctx.fillStyle="#09150f";
  ctx.fillRect(0,0,w,h);
  state.buttons=[];

  const titleSize=clamp(4.1*u,15,23);
  if(creatureAlpha>.001){
    ctx.save();ctx.globalAlpha=creatureAlpha;
    text("CREATURE ZERO",pad,pad,{size:titleSize,weight:900,color:"#eef3df"});
    ctx.restore();
  }
  if(homeAlpha>.001){
    ctx.save();ctx.globalAlpha=homeAlpha;
    text("HOME CLEARING",pad,pad,{size:titleSize,weight:900,color:"#eef3df"});
    ctx.restore();
  }
  if(expeditionAlpha>.001){
    ctx.save();ctx.globalAlpha=expeditionAlpha;
    text("MOSSGLASS HOLLOW",pad,pad,{size:titleSize,weight:900,color:"#eef3df"});
    ctx.restore();
  }
  if(battleAlpha>.001){
    ctx.save();ctx.globalAlpha=battleAlpha;
    text("FIRST BATTLE",pad,pad,{size:titleSize,weight:900,color:"#eef3df"});
    ctx.restore();
  }

  text(
    "L "+W.toFixed(3)+" · S "+state.W.scene.toFixed(3),
    pad,pad+titleSize+4,
    {size:clamp(2.35*u,9,12),weight:700,color:"#73887a",family:"ui-monospace,SFMono-Regular,Menlo,monospace"}
  );

  const navW=clamp(24*u,88,118);
  const navH=clamp(8.4*u,31,39);
  const musicGap=7;
  const musicR={x:w-pad-navH,y:pad,w:navH,h:navH};
  const navR={x:musicR.x-musicGap-navW,y:pad,w:navW,h:navH};

  if(window.BudborneMusic){
    const musicOn=window.BudborneMusic.isEnabled();
    drawButton(
      "music-toggle",
      musicR,
      musicOn?"♫":"♪",
      ()=>window.BudborneMusic.toggle(),
      {fill:musicOn?"#4c6745":"#26372d",hot:"#bce77f",size:16}
    );
  }

  if(state.W.scene<.015&&state.sceneTarget===0){
    drawButton("to-home",navR,"🏡 Home",()=>goScene(1),{fill:"#365442",size:13});
  }else if(Math.abs(state.W.scene-1)<.015&&state.sceneTarget===1){
    drawButton("to-creature",navR,"🌿 Creature",()=>goScene(0),{fill:"#365442",size:13});
  }else if(Math.abs(state.W.scene-2)<.015&&state.sceneTarget===2){
    drawButton("exp-home",navR,"🏡 Home",()=>returnFromExpedition(),{fill:"#365442",size:13});
  }

  const portraitCreature={x:pad,y:contentY,w:w-pad*2,h:contentH*.43};
  const portraitInfo={x:pad,y:contentY+contentH*.45,w:w-pad*2,h:contentH*.55};
  const wideW=(w-pad*3)/2;
  const wideCreature={x:pad,y:contentY,w:wideW,h:contentH};
  const wideInfo={x:pad*2+wideW,y:contentY,w:wideW,h:contentH};
  const petCreature=mixRect(portraitCreature,wideCreature,W);
  const petInfo=mixRect(portraitInfo,wideInfo,W);

  const home=homeLayout(w,h,pad,contentY,contentH,W);
  const exp=expeditionLayout(w,h,pad,contentY,contentH,W);
  const bat=battleLayout(w,h,pad,contentY,contentH,W);

  const creatureAtHome=mixRect(petCreature,home.patch,H);
  const creatureAtExpedition=mixRect(creatureAtHome,exp.companion,E);
  const creaturePanel=mixRect(creatureAtExpedition,bat.player,B);

  if(B<.999){
    ctx.save();
    ctx.globalAlpha=1-B;
    fillRound(creaturePanel,"#10251a",20);
    strokeRound(creaturePanel,"#ffffff12",20,1);
    drawCreature(creaturePanel,now);
    ctx.restore();
  }

  const infoExit=W<.5
    ?{x:petInfo.x,y:h+pad,w:petInfo.w,h:petInfo.h}
    :{x:w+pad,y:petInfo.y,w:petInfo.w,h:petInfo.h};
  const carePanel=mixRect(petInfo,infoExit,H);
  if(H<.995){
    ctx.save();
    ctx.globalAlpha=1-H;
    drawCarePanel(carePanel,u,state.W.scene<.015&&state.sceneTarget===0);
    ctx.restore();
  }

  if(H>.005&&homeAlpha>.001){
    const HH=state.home||{day:1,hour:8,seeds:0,moist:0,inventory:{}};
    const origin={
      x:home.patch.x+home.patch.w*.5-10,
      y:home.patch.y+home.patch.h*.5-10,
      w:20,h:20
    };

    ctx.save();
    ctx.globalAlpha=homeAlpha;

    const isoArea={x:pad,y:contentY,w:w-pad*2,h:contentH};
    drawIsoHome(isoArea,now,Math.abs(state.W.scene-1)<.015&&state.sceneTarget===1);
    ctx.restore();

    if(Math.abs(state.W.scene-1)<.015&&state.sceneTarget===1){
      drawHomeDrawer(w,h,pad,u);
    }
  }

  if(E>.005&&expeditionAlpha>.001){
    const R=state.expedition||expeditionDefaults();
    const routePanel=mixRect(home.trail,exp.route,E);
    const infoOrigin={x:home.trail.x,y:home.trail.y,w:home.trail.w,h:home.trail.h};
    const infoPanel=mixRect(infoOrigin,exp.info,E);

    ctx.save();
    ctx.globalAlpha=expeditionAlpha;
    const expInteractive=Math.abs(state.W.scene-2)<.015&&state.sceneTarget===2;
    drawMossglassWorld(routePanel,R,now,expInteractive);
    drawExpeditionInfo(infoPanel,R,u,expInteractive);
    ctx.restore();
  }

  if(B>.005){
    const Battle=state.battle||battleDefaults();
    const arenaPanel=mixRect(exp.route,bat.arena,B);
    const infoPanel=mixRect(exp.info,bat.info,B);
    const enemyOrigin={x:exp.route.x+exp.route.w*.58,y:exp.route.y+exp.route.h*.36,w:20,h:20};
    const enemyPanel=mixRect(enemyOrigin,bat.enemy,B);

    ctx.save();
    ctx.globalAlpha=battleAlpha;
    const battleInteractive=state.W.scene>2.985&&state.sceneTarget===3;
    drawBattleArena(arenaPanel,Battle,creaturePanel,enemyPanel,now,battleInteractive);
    drawBattleInfo(infoPanel,Battle,u,battleInteractive);
    ctx.restore();
  }

  requestAnimationFrame(draw);
}

window.addEventListener("resize",solveViewport,{passive:true});
window.visualViewport?.addEventListener("resize",solveViewport,{passive:true});

syncHomeClock();
loadCreature();
loadExpedition();

const initialParams=new URLSearchParams(location.search);
if(initialParams.get("scene")==="expedition"){
  state.W.scene=2;
  state.sceneTarget=2;
  initialParams.delete("scene");
  const clean=location.pathname+(initialParams.toString()?"?"+initialParams.toString():"");
  history.replaceState(null,"",clean);
}else if(initialParams.get("scene")==="battle"&&state.expedition&&state.expedition.battlePending){
  state.battle=battleDefaults();
  state.W.scene=3;
  state.sceneTarget=3;
  initialParams.delete("scene");
  const clean=location.pathname+(initialParams.toString()?"?"+initialParams.toString():"");
  history.replaceState(null,"",clean);
}

syncMusicTheme(state.sceneTarget);
solveViewport();
requestAnimationFrame(draw);
