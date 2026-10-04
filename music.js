(function(){
  const THEME=window.BUDBORNE_MUSIC_THEME||"home";
  const STORE="budborne:music-enabled";
  const TITLES={creature:"Creature Theme",home:"Home Theme",expedition:"Expedition Theme",battle:"Battle Theme"};
  const CFG={
    creature:{bpm:72,root:62},
    home:{bpm:86,root:60},
    expedition:{bpm:96,root:57},
    battle:{bpm:118,root:50}
  }[THEME]||{bpm:86,root:60};

  let enabled=localStorage.getItem(STORE)==="1";
  let ctx=null,master=null,wet=null,timer=null,nextBar=0,bar=0,started=false;

  const style=document.createElement("style");
  style.textContent=`
    .bud-music{position:fixed;right:14px;bottom:calc(14px + env(safe-area-inset-bottom));z-index:9999;min-width:92px;height:46px;padding:0 14px;border-radius:999px;border:1px solid #ffffff26;background:#09150fe8;color:#c9d8c9;box-shadow:0 8px 24px #0008;font:900 1.15rem system-ui;display:grid;place-items:center;backdrop-filter:blur(8px)}
    .bud-music.on{color:#dff6a9;border-color:#a9db7060;box-shadow:0 0 0 4px #a9db7017,0 8px 24px #0008}
    .bud-music:active{transform:translateY(1px)}
  `;
  document.head.appendChild(style);

  let button=document.getElementById("budMusicControl");
  if(!button){
    button=document.createElement("button");
    button.id="budMusicControl";
    button.type="button";
    document.body.appendChild(button);
  }
  button.className="bud-music"+(enabled?" on":"");
  button.setAttribute("aria-label","Toggle "+(TITLES[THEME]||"music"));
  button.title=(TITLES[THEME]||"Music")+" · tap to toggle";
  button.textContent=enabled?"♫ Music":"♩ Music";

  function midi(n){return 440*Math.pow(2,(n-69)/12)}
  function destination(){
    const dry=ctx.createGain();
    dry.gain.value=.72;
    const delay=ctx.createDelay(.8);delay.delayTime.value=.27;
    const feedback=ctx.createGain();feedback.gain.value=.22;
    const wetGain=ctx.createGain();wetGain.gain.value=.16;
    dry.connect(master);
    dry.connect(delay);delay.connect(feedback);feedback.connect(delay);delay.connect(wetGain);wetGain.connect(master);
    return dry;
  }
  function tone(note,when,dur,type="triangle",gain=.045,attack=.02,release=.3){
    const o=ctx.createOscillator(),g=ctx.createGain(),f=ctx.createBiquadFilter();
    o.type=type;o.frequency.value=midi(note);
    f.type="lowpass";f.frequency.value=THEME==="battle"?1800:1300;f.Q.value=.6;
    const out=destination();o.connect(f);f.connect(g);g.connect(out);
    g.gain.setValueAtTime(.0001,when);
    g.gain.exponentialRampToValueAtTime(Math.max(.0002,gain),when+attack);
    g.gain.setValueAtTime(Math.max(.0002,gain*.8),Math.max(when+attack,when+dur-release));
    g.gain.exponentialRampToValueAtTime(.0001,when+dur);
    o.start(when);o.stop(when+dur+.05);
  }
  function pad(notes,when,dur,gain=.025){
    notes.forEach((n,i)=>tone(n,when,dur,"sine",gain/(i?1.2:1),.25,.7));
  }
  function bell(note,when,dur=.8,gain=.035){
    tone(note,when,dur,"sine",gain,.008,.5);
    tone(note+12,when,dur*.55,"triangle",gain*.16,.008,.35);
  }
  function pluck(note,when,dur=.38,gain=.036){
    tone(note,when,dur,"triangle",gain,.005,.24);
  }
  function drum(when,strong=false){
    const o=ctx.createOscillator(),g=ctx.createGain();o.type="sine";
    o.frequency.setValueAtTime(strong?110:82,when);o.frequency.exponentialRampToValueAtTime(42,when+.11);
    g.gain.setValueAtTime(strong?.075:.045,when);g.gain.exponentialRampToValueAtTime(.0001,when+.14);
    o.connect(g);g.connect(master);o.start(when);o.stop(when+.15);
  }
  function tickPerc(when,gain=.015){
    const o=ctx.createOscillator(),g=ctx.createGain();o.type="square";o.frequency.value=1700;
    g.gain.setValueAtTime(gain,when);g.gain.exponentialRampToValueAtTime(.0001,when+.035);
    o.connect(g);g.connect(master);o.start(when);o.stop(when+.04);
  }

  function scheduleCreature(t,b,beat){
    const chords=[[62,65,69],[60,64,67],[57,62,65],[60,64,69]];
    pad(chords[b%4],t,beat*3.8,.018);
    const melody=[[74,null,76,null],[72,null,69,72],[69,null,72,null],[76,74,null,72]][b%4];
    melody.forEach((n,i)=>{if(n!==null)bell(n,t+i*beat,beat*.8,.025)});
  }
  function scheduleHome(t,b,beat){
    const bass=[48,45,50,43][b%4], chords=[[60,64,67],[57,60,64],[62,65,69],[55,59,62]][b%4];
    pad(chords,t,beat*3.9,.017);
    [0,2].forEach(i=>pluck(bass,t+i*beat,beat*.55,.028));
    const arp=[chords[0]+12,chords[1]+12,chords[2]+12,chords[1]+12];
    arp.forEach((n,i)=>pluck(n,t+i*beat,beat*.45,.024));
    if(b%2===1)bell(chords[2]+12,t+3*beat,beat*.7,.017);
  }
  function scheduleExpedition(t,b,beat){
    const chords=[[57,60,64],[55,59,62],[60,64,67],[57,62,65]];
    pad(chords[b%4],t,beat*3.9,.016);
    const motif=[[69,72,74,76],[67,71,74,72],[72,74,76,79],[69,74,72,71]][b%4];
    motif.forEach((n,i)=>pluck(n,t+(i*.75)*beat,beat*.48,.026));
    pluck(45+(b%2)*2,t,beat*.7,.024);
    if(b%4===3)bell(81,t+3.25*beat,beat*.65,.015);
  }
  function scheduleBattle(t,b,beat){
    const roots=[50,48,53,45];
    const r=roots[b%4];

    // Low, breathing tension instead of a metronomic click.
    pad([r,r+3,r+7],t,beat*3.85,.014);
    tone(r-12,t,beat*1.15,"sine",.030,.03,.45);
    tone(r-12,t+2*beat,beat*1.05,"sine",.026,.03,.42);

    // Uneven drum accents keep urgency without sounding like a turn signal.
    drum(t,true);
    drum(t+1.5*beat,false);
    if(b%2===1)drum(t+3.15*beat,false);

    // A climbing minor figure gives the battle forward motion.
    const figures=[
      [r+12,r+15,r+19,r+22],
      [r+12,r+17,r+15,r+19],
      [r+12,r+15,r+20,r+19],
      [r+12,r+19,r+17,r+15]
    ][b%4];
    const offsets=[.15,.95,2.15,3.05];
    figures.forEach((n,i)=>pluck(n,t+offsets[i]*beat,beat*.56,.030));

    // One sustained upper answer every other bar.
    if(b%2===0)bell(r+27,t+2.55*beat,beat*.95,.014);
  }
  function scheduleBar(t,b){
    const beat=60/CFG.bpm;
    if(THEME==="creature")scheduleCreature(t,b,beat);
    else if(THEME==="home")scheduleHome(t,b,beat);
    else if(THEME==="expedition")scheduleExpedition(t,b,beat);
    else scheduleBattle(t,b,beat);
  }
  function scheduler(){
    if(!ctx||ctx.state!=="running")return;
    const barDur=(60/CFG.bpm)*4;
    while(nextBar<ctx.currentTime+1.2){
      scheduleBar(nextBar,bar++);
      nextBar+=barDur;
    }
  }
  async function start(){
    if(started)return true;
    if(!ctx){
      ctx=new (window.AudioContext||window.webkitAudioContext)();
      master=ctx.createGain();
      const compressor=ctx.createDynamicsCompressor();
      master.gain.value=.15;
      master.connect(compressor);compressor.connect(ctx.destination);
    }
    try{await ctx.resume()}catch(e){}
    if(ctx.state!=="running")return false;
    started=true;bar=0;nextBar=ctx.currentTime+.08;
    scheduler();
    if(timer)clearInterval(timer);
    timer=setInterval(scheduler,350);
    paint();
    return true;
  }
  function stop(){
    started=false;
    if(timer){clearInterval(timer);timer=null}
    if(master&&ctx){
      try{master.gain.cancelScheduledValues(ctx.currentTime);master.gain.setValueAtTime(master.gain.value,ctx.currentTime);master.gain.linearRampToValueAtTime(0,ctx.currentTime+.12)}catch(e){}
      const old=ctx;setTimeout(()=>{try{old.close()}catch(e){}},180);
    }
    ctx=null;master=null;
  }
  function paint(){
    button.classList.toggle("on",enabled);
    button.textContent=enabled?"♫ Music":"♩ Music";
    button.title=(TITLES[THEME]||"Music")+" · "+(enabled?"on":"off");
  }
  button.addEventListener("click",async function(e){
    e.stopPropagation();

    // On iPhone a new document may inherit the preference but not permission
    // to start its new AudioContext. In that case, one tap wakes it instead
    // of forcing an off/on cycle.
    if(enabled&&!started){
      await start();
      return;
    }

    enabled=!enabled;
    localStorage.setItem(STORE,enabled?"1":"0");
    paint();
    if(enabled)await start();else stop();
  });

  if(enabled){
    start();

    const unlock=async function(){
      if(!enabled||started)return;
      const ok=await start();
      if(ok){
        document.removeEventListener("pointerdown",unlock,true);
        document.removeEventListener("touchstart",unlock,true);
        document.removeEventListener("keydown",unlock,true);
      }
    };

    // Any normal interaction in the new state can wake its soundtrack.
    document.addEventListener("pointerdown",unlock,true);
    document.addEventListener("touchstart",unlock,true);
    document.addEventListener("keydown",unlock,true);
  }
})();