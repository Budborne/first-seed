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
  const heroSize=clamp(lerp(6.8,8.6,state.W.layout)*u,18,42);

  text("BUDBORNE · W CANVAS 002",16,16,{
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

  text("GROW SOMETHING.",r.x+r.w/2,r.y+r.h/2,{
    size:heroSize,
    weight:900,
    align:"center",
    baseline:"middle",
    color:active?"#17301f":"#102218"
  });

  requestAnimationFrame(draw);
}

window.addEventListener("resize",solveViewport,{passive:true});
window.visualViewport?.addEventListener("resize",solveViewport,{passive:true});

solveViewport();
requestAnimationFrame(draw);
