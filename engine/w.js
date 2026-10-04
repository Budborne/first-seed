const canvas=document.getElementById("world");
const ctx=canvas.getContext("2d",{alpha:false});

const KEY="budborne:first-seed";
const HOME_KEY="budborne:home-v1";
const HOUR=3600000;

const STAGES=[
  {key:"seed",name:"Seed",min:0,next:12},
  {key:"sprout",name:"Sprout",min:12,next:30},
  {key:"shoot",name:"Shoot",min:30,next:65},
  {key:"youngling",name:"Youngling",min:65,next:120},
  {key:"budborn",name:"Budborn",min:120,next:null}
];

const state={
  view:{w:0,h:0,dpr:1},
  W:{layout:0,scene:0},
  sceneTarget:0,
  lastFrame:performance.now(),
  home:null,
  pointer:{x:0,y:0,down:false},
  buttons:[],
  pressed:null,
  message:"Creature Zero watches you.",
  bumpUntil:0,
  worldNow:0,
  creature:null
};

const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const lerp=(a,b,t)=>a+(b-a)*t;
const smoothstep=t=>t*t*(3-2*t);
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

function drawCreature(panel,now){
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

  text(st.name,panel.x+14,panel.y+12,{size:12,weight:850,color:"#dfe9d7"});
  text(mood(),panel.x+panel.w-14,panel.y+12,{size:11,weight:750,align:"right",color:"#91a796"});
}

function goScene(target){
  state.sceneTarget=target?1:0;
  state.pressed=null;
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
  fillRound(r,opt.fill||"#10251a",18);
  strokeRound(r,"#ffffff12",18,1);
  const size=fitText(title,r.w-20,{maxSize:14,minSize:10,weight:880});
  text(title,r.x+12,r.y+11,{size,weight:880,color:"#eef3df"});
  if(subtitle){
    const ss=fitText(subtitle,r.w-20,{maxSize:11,minSize:8,weight:650});
    text(subtitle,r.x+12,r.y+13+size,{size:ss,weight:650,color:"#8fa394"});
  }
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
  const dt=Math.min(50,Math.max(0,now-state.lastFrame));
  state.lastFrame=now;

  const sceneStep=dt/720;
  if(state.W.scene<state.sceneTarget)state.W.scene=Math.min(state.sceneTarget,state.W.scene+sceneStep);
  else if(state.W.scene>state.sceneTarget)state.W.scene=Math.max(state.sceneTarget,state.W.scene-sceneStep);

  const T=smoothstep(state.W.scene);
  const u=Math.min(w,h)/100;
  const pad=clamp(3.5*u,12,22);
  const headerH=clamp(13*u,52,68);
  const contentY=headerH+pad*.2;
  const contentH=h-contentY-pad;

  ctx.fillStyle="#09150f";
  ctx.fillRect(0,0,w,h);
  state.buttons=[];

  const titleSize=clamp(4.1*u,15,23);
  ctx.save();
  ctx.globalAlpha=1-T;
  text("CREATURE ZERO",pad,pad,{size:titleSize,weight:900,color:"#eef3df"});
  ctx.restore();

  ctx.save();
  ctx.globalAlpha=T;
  text("HOME CLEARING",pad,pad,{size:titleSize,weight:900,color:"#eef3df"});
  ctx.restore();

  text(
    "L "+W.toFixed(3)+" · S "+state.W.scene.toFixed(3),
    pad,pad+titleSize+4,
    {size:clamp(2.35*u,9,12),weight:700,color:"#73887a",family:"ui-monospace,SFMono-Regular,Menlo,monospace"}
  );

  const navW=clamp(24*u,88,118);
  const navH=clamp(8.4*u,31,39);
  const navR={x:w-pad-navW,y:pad,w:navW,h:navH};
  if(state.W.scene<.015&&state.sceneTarget===0){
    drawButton("to-home",navR,"🏡 Home",()=>goScene(1),{fill:"#365442",size:13});
  }else if(state.W.scene>.985&&state.sceneTarget===1){
    drawButton("to-creature",navR,"🌿 Creature",()=>goScene(0),{fill:"#365442",size:13});
  }

  const portraitCreature={x:pad,y:contentY,w:w-pad*2,h:contentH*.43};
  const portraitInfo={x:pad,y:contentY+contentH*.45,w:w-pad*2,h:contentH*.55};
  const wideW=(w-pad*3)/2;
  const wideCreature={x:pad,y:contentY,w:wideW,h:contentH};
  const wideInfo={x:pad*2+wideW,y:contentY,w:wideW,h:contentH};
  const petCreature=mixRect(portraitCreature,wideCreature,W);
  const petInfo=mixRect(portraitInfo,wideInfo,W);

  const home=homeLayout(w,h,pad,contentY,contentH,W);
  const creaturePanel=mixRect(petCreature,home.patch,T);

  fillRound(creaturePanel,"#10251a",20);
  strokeRound(creaturePanel,"#ffffff12",20,1);
  drawCreature(creaturePanel,now);

  const infoExit=W<.5
    ?{x:petInfo.x,y:h+pad,w:petInfo.w,h:petInfo.h}
    :{x:w+pad,y:petInfo.y,w:petInfo.w,h:petInfo.h};
  const infoPanel=mixRect(petInfo,infoExit,T);

  if(T<.995){
    ctx.save();
    ctx.globalAlpha=1-T;
    drawCarePanel(infoPanel,u,state.W.scene<.015&&state.sceneTarget===0);
    ctx.restore();
  }

  if(T>.005){
    const H=state.home||{day:1,hour:8,seeds:0,moist:0,inventory:{}};
    const origin={
      x:home.patch.x+home.patch.w*.5-10,
      y:home.patch.y+home.patch.h*.5-10,
      w:20,h:20
    };

    ctx.save();
    ctx.globalAlpha=T;

    const cottage=mixRect(origin,home.cottage,T);
    const trail=mixRect(origin,home.trail,T);
    const store=mixRect(origin,home.store,T);
    const garden=mixRect(origin,home.garden,T);

    drawHomeCard(cottage,"Cottage","Day "+H.day+" · "+String(Math.floor(H.hour)).padStart(2,"0")+":00",{fill:"#17271d"});
    drawHomeCard(trail,"Wild Trail","Mossglass Hollow",{fill:"#122a1d"});
    drawHomeCard(store,"Storehouse","Seeds "+(H.seeds||0)+" · Resin "+((H.inventory&&H.inventory.resin)||0),{fill:"#17231c"});
    drawHomeCard(garden,"Garden","Moisture "+Math.round(H.moist||0)+"%",{fill:"#13261a"});
    drawGardenBeds(garden);

    text("Creature Patch",creaturePanel.x+creaturePanel.w/2,creaturePanel.y+creaturePanel.h-10,{
      size:fitText("Creature Patch",creaturePanel.w-24,{maxSize:12,minSize:9,weight:800}),
      weight:800,
      align:"center",
      baseline:"bottom",
      color:"#839889"
    });

    ctx.restore();
  }

  requestAnimationFrame(draw);
}

window.addEventListener("resize",solveViewport,{passive:true});
window.visualViewport?.addEventListener("resize",solveViewport,{passive:true});

syncHomeClock();
loadCreature();
solveViewport();
requestAnimationFrame(draw);
