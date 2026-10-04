const canvas=document.getElementById("world");
const ctx=canvas.getContext("2d",{alpha:false});

const state={
  view:{w:0,h:0,dpr:1},
  W:{layout:0},
  pointer:{x:0,y:0,down:false,inside:false},
  rect:{x:0,y:0,w:0,h:0}
};

const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const lerp=(a,b,t)=>a+(b-a)*t;

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
    }else{
      line=test;
    }
  }
  if(line)lines.push(line);
  return lines;
}

function stackY(heights,centerY,gap){
  const total=heights.reduce((sum,h)=>sum+h,0)+gap*Math.max(0,heights.length-1);
  let y=centerY-total/2;
  return heights.map(h=>{
    const top=y;
    y+=h+gap;
    return top;
  });
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

  // W=0 favors tall/compact layouts. W=1 favors wide layouts.
  const aspect=w/h;
  state.W.layout=clamp((aspect-.58)/(1.65-.58),0,1);

  const u=Math.min(w,h)/100;
  const rw=clamp(lerp(72,54,state.W.layout)*u,160,w-32);
  const rh=clamp(lerp(32,46,state.W.layout)*u,110,h-32);

  state.rect={
    x:(w-rw)/2,
    y:(h-rh)/2,
    w:rw,
    h:rh
  };

  hitTest();
}

function hitTest(){
  const r=state.rect,p=state.pointer;
  p.inside=p.x>=r.x&&p.x<=r.x+r.w&&p.y>=r.y&&p.y<=r.y+r.h;
}

function pointerPosition(e){
  const rect=canvas.getBoundingClientRect();
  state.pointer.x=e.clientX-rect.left;
  state.pointer.y=e.clientY-rect.top;
  hitTest();
}

canvas.addEventListener("pointerdown",e=>{
  pointerPosition(e);
  state.pointer.down=true;
  canvas.setPointerCapture?.(e.pointerId);
});
canvas.addEventListener("pointermove",pointerPosition);
canvas.addEventListener("pointerup",e=>{
  pointerPosition(e);
  state.pointer.down=false;
});
canvas.addEventListener("pointercancel",()=>state.pointer.down=false);

function draw(){
  const {w,h}=state.view;
  const r=state.rect;
  const active=state.pointer.down&&state.pointer.inside;

  ctx.fillStyle="#09150f";
  ctx.fillRect(0,0,w,h);

  ctx.fillStyle=active?"#bce77f":"#6ea85b";
  ctx.fillRect(r.x,r.y,r.w,r.h);

  ctx.lineWidth=2;
  ctx.strokeStyle="#dff6a9";
  ctx.strokeRect(r.x+.5,r.y+.5,r.w-1,r.h-1);

  const u=Math.min(w,h)/100;
  const labelSize=clamp(3.1*u,11,16);
  const desiredHero=clamp(lerp(6.8,8.6,state.W.layout)*u,18,42);
  const heroSize=fitText("GROW SOMETHING.",r.w-24,{
    maxSize:desiredHero,
    minSize:14,
    weight:900
  });

  text("BUDBORNE · W CANVAS 005",16,16,{
    size:labelSize,weight:700
  });

  text(
    Math.round(w)+"×"+Math.round(h)+
    "  DPR "+state.view.dpr.toFixed(2)+
    "  W "+state.W.layout.toFixed(3),
    16,16+labelSize+7,{
      size:clamp(2.8*u,10,14),
      weight:600,
      family:"ui-monospace,SFMono-Regular,Menlo,monospace",
      color:"#819487"
    }
  );

  const bodySize=clamp(3.2*u,11,16);
  const lines=wrapText(
    "The same sentence now respects a solved width without needing a DOM text box.",
    r.w-24,
    {size:bodySize,weight:650}
  );
  const lineHeight=bodySize*1.28;
  const heroHeight=heroSize*1.08;
  const bodyHeight=lines.length*lineHeight;
  const gap=clamp(2.5*u,10,18);
  const [heroTop,bodyTop]=stackY(
    [heroHeight,bodyHeight],
    r.y+r.h/2,
    gap
  );

  text("GROW SOMETHING.",r.x+r.w/2,heroTop+heroHeight/2,{
    size:heroSize,
    weight:900,
    align:"center",
    baseline:"middle",
    color:active?"#17301f":"#102218"
  });

  lines.forEach((line,i)=>text(line,r.x+r.w/2,bodyTop+i*lineHeight,{
    size:bodySize,
    weight:650,
    align:"center",
    baseline:"top",
    color:"#24452c"
  }));

  requestAnimationFrame(draw);
}

window.addEventListener("resize",solveViewport,{passive:true});
window.visualViewport?.addEventListener("resize",solveViewport,{passive:true});

solveViewport();
requestAnimationFrame(draw);
