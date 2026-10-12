/* Réorganisation des teams — tableau blanc ouvert depuis l'outil de gestion de la CAF.
   Une zone par équipe (déplaçable, redimensionnable), un post-it par équipier. L'équipe d'un équipier est la zone
   sous lui. Notes 1 à 3 (Junior, Intermédiaire, Senior) et note libre mémorisées dans ce navigateur, par nom. */
(function(){
'use strict';
var LV={1:'Junior',2:'Intermédiaire',3:'Senior'}, CW=140, CH=40, ZW=340, HEAD=64, KEY='tk-reorg-teams-v1';
var root=null, board=null, zones=[], people=[], pop=null, zTop=10, BW=1180, BH=760, src=[];
var CSS="#reorg{position:fixed;inset:0;z-index:2000;background:#F4F5F7;display:flex;flex-direction:column;font-family:'Manrope',sans-serif;font-size:12px;line-height:1.35;color:#0C1A2E;\n  --board:#FBFBFC;--dot:#C9D0DA;--surface:#fff;--line:#E1E5EB;--line2:#B9C1CD;--muted:#667589;--accent:#1A3A8A;--accent-bg:#EEF3FF;\n  --zone:rgba(26,58,138,.045);--zone-line:#9FB0D0;--zone-over:rgba(26,58,138,.12);\n  --s1:#BFE3DC;--s2:#4FB3A3;--s3:#14705F;--s1t:#0C3B33;--s2t:#04201B;--s3t:#fff;--up:#1A7A42;--down:#C0392B;--warn:#8A5A00;--warn-bg:#FFF4D6;\n  --shadow:0 1px 2px rgba(12,26,46,.18),0 3px 8px rgba(12,26,46,.08)}\n#reorg *{box-sizing:border-box}\n#reorg[hidden]{display:none}\n#reorg .num{font-variant-numeric:tabular-nums;font-family:'DM Mono',monospace}\n#reorg .rg-bar{background:#0C1A2E;color:#fff;padding:10px 16px;display:flex;flex-wrap:wrap;gap:8px 18px;align-items:center}\n#reorg .rg-bar h2{margin:0;font-size:15px;font-weight:800;letter-spacing:-.2px}\n#reorg .stat{display:flex;gap:6px;align-items:baseline;color:#8FA0B8}\n#reorg .stat b{color:#fff;font-size:14px}\n#reorg .legend{display:flex;gap:12px;align-items:center;color:#8FA0B8;margin-left:auto;flex-wrap:wrap}\n#reorg .legend span{display:inline-flex;gap:5px;align-items:center}\n#reorg .dot{width:9px;height:9px;border-radius:50%;display:inline-block}\n#reorg .d1{background:var(--s1)}#reorg .d2{background:var(--s2)}#reorg .d3{background:var(--s3)}\n#reorg .btn{border:1px solid #33496B;background:transparent;color:#fff;border-radius:6px;padding:5px 10px;font:600 11px 'Manrope',sans-serif;cursor:pointer}\n#reorg .btn:hover{background:#1A2E4A}\n#reorg .pop .btn{border-color:var(--line2);color:inherit;margin-top:5px}\n#reorg .pop .btn:hover{background:var(--accent-bg)}\n#reorg :focus-visible{outline:2px solid var(--accent);outline-offset:1px}\n#reorg .scroll{flex:1;overflow:auto;background:var(--board)}\n#reorg .board{position:relative;background-image:radial-gradient(var(--dot) 1.2px,transparent 1.3px);background-size:22px 22px;touch-action:none}\n#reorg .foot{padding:6px 16px;color:var(--muted);font-size:11px;background:#fff;border-top:1px solid var(--line)}\n#reorg .zone{position:absolute;background:var(--zone);border:1.5px dashed var(--zone-line);border-radius:14px}\n#reorg .zone.over{background:var(--zone-over);border-style:solid;border-color:var(--accent)}\n#reorg .z-head{display:flex;justify-content:space-between;gap:8px;padding:8px 10px 0;cursor:grab;user-select:none}\n#reorg .z-name{font-weight:800;font-size:12px;letter-spacing:.4px}\n#reorg .z-sub{font-size:10px;color:var(--muted)}\n#reorg .z-score{text-align:right;line-height:1}\n#reorg .z-score .big{font-size:20px;font-weight:700}\n#reorg .z-score .dl{display:block;font-size:9.5px;margin-top:3px;color:var(--muted)}\n#reorg .dl.up{color:var(--up)}#reorg .dl.down{color:var(--down)}\n#reorg .z-dist{display:flex;height:5px;border-radius:3px;overflow:hidden;background:var(--line);margin:6px 10px 0}\n#reorg .z-dist i{display:block}\n#reorg .a1{background:var(--s1)}#reorg .a2{background:var(--s2)}#reorg .a3{background:var(--s3)}\n#reorg .z-warn{margin:5px 10px 0;display:inline-block;font-size:9.5px;font-weight:600;background:var(--warn-bg);color:var(--warn);border-radius:4px;padding:1px 6px}\n#reorg .grow{position:absolute;right:3px;bottom:3px;width:14px;height:14px;cursor:nwse-resize;opacity:.6;background:linear-gradient(135deg,transparent 50%,var(--line2) 50%,var(--line2) 58%,transparent 58%,transparent 72%,var(--line2) 72%,var(--line2) 80%,transparent 80%)}\n#reorg .chip{position:absolute;width:140px;background:var(--surface);border:1px solid var(--line2);border-radius:6px;box-shadow:var(--shadow);padding:4px 6px 5px;cursor:grab;user-select:none;border-left:4px solid var(--line2);z-index:2}\n#reorg .chip.r1{border-left-color:var(--s1)}#reorg .chip.r2{border-left-color:var(--s2)}#reorg .chip.r3{border-left-color:var(--s3)}\n#reorg .chip.norate{border-style:dashed}\n#reorg .chip.drag{cursor:grabbing;box-shadow:0 8px 20px rgba(12,26,46,.28)}\n#reorg .c-name{font-weight:700;font-size:11.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n#reorg .c-row{display:flex;align-items:center;justify-content:space-between;gap:4px;margin-top:3px}\n#reorg .c-role{font-size:9.5px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}\n#reorg .c-role em{font-style:normal;color:var(--accent);font-weight:700}\n#reorg .rate{display:flex;gap:2px;flex:none}\n#reorg .rate button{width:17px;height:17px;border-radius:50%;border:1px solid var(--line2);background:var(--surface);font:500 10px 'DM Mono',monospace;padding:0;cursor:pointer;line-height:1;color:#0C1A2E}\n#reorg .rate button.on1{background:var(--s1);color:var(--s1t);border-color:var(--s1)}\n#reorg .rate button.on2{background:var(--s2);color:var(--s2t);border-color:var(--s2)}\n#reorg .rate button.on3{background:var(--s3);color:var(--s3t);border-color:var(--s3)}\n#reorg .rate .nb{border:0;background:transparent;width:auto;border-radius:0;color:var(--muted);font-size:12px;padding:0 1px;height:17px}\n#reorg .rate .nb.has{color:var(--accent)}\n#reorg .rate .nb.has::after{content:\"\";display:inline-block;width:5px;height:5px;border-radius:50%;background:var(--accent);margin-left:1px;vertical-align:top}\n#reorg .pop{position:absolute;z-index:80;width:210px;background:var(--surface);border:1px solid var(--line2);border-radius:8px;box-shadow:var(--shadow);padding:8px}\n#reorg .pop b{display:block;font-size:11px;margin-bottom:4px}\n#reorg .pop textarea{width:100%;height:64px;resize:none;border:1px solid var(--line2);border-radius:5px;background:var(--board);padding:5px 6px;font:11.5px 'Manrope',sans-serif}\n#reorg .empty{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--muted);font-size:13px}";

function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function f1(x){return x==null?'—':x.toFixed(1).replace('.',',');}
function esc(s){return String(s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
function load(){ try{ return JSON.parse(localStorage.getItem(KEY)||'{}')||{}; }catch(e){ return {}; } }
function save(){ try{ var o={}; people.forEach(function(p){ if(p.rating||p.note) o[p.name]={r:p.rating,n:p.note}; }); localStorage.setItem(KEY,JSON.stringify(o)); }catch(e){} }

function ensureRoot(){
  if(root) return;
  var st=document.createElement('style'); st.textContent=CSS; document.head.appendChild(st);
  root=document.createElement('div'); root.id='reorg'; root.hidden=true; root.setAttribute('role','dialog'); root.setAttribute('aria-label','Réorganisation des teams');
  root.innerHTML='<div class="rg-bar"><h2>Réorganisation des teams</h2>'+
    '<div class="stat">Moyenne <b class="num" id="rg-avg">—</b></div><div class="stat">Déplacés <b class="num" id="rg-moved">0</b></div><div class="stat">Hors équipe <b class="num" id="rg-out">0</b></div>'+
    '<div class="legend"><span><i class="dot d1"></i>1 Junior</span><span><i class="dot d2"></i>2 Intermédiaire</span><span><i class="dot d3"></i>3 Senior</span>'+
    '<button class="btn" id="rg-reset" type="button">Réinitialiser</button><button class="btn" id="rg-close" type="button">Fermer</button></div></div>'+
    '<div class="scroll"><div class="board" id="rg-board"></div></div>'+
    '<div class="foot">Déplace une équipe par son titre, redimensionne-la par le coin. Glisse un post-it dans une équipe pour l\'y affecter. Clique 1, 2 ou 3 pour noter, ✎ pour la note libre. Note d\'équipe = moyenne des équipiers notés.</div>';
  document.body.appendChild(root);
  board=root.querySelector('#rg-board');
  root.querySelector('#rg-close').onclick=close;
  root.querySelector('#rg-reset').onclick=function(){ closePop(); layout(); };
  document.addEventListener('keydown',function(e){ if(e.key==='Escape' && !root.hidden){ if(pop) closePop(); else close(); } });
}
function close(){ closePop(); root.hidden=true; document.body.style.overflow=''; }

function layout(){
  board.innerHTML=''; zones=[]; people=[];
  var saved=load(), names=[];
  src.forEach(function(s){ if(names.indexOf(s.team)<0) names.push(s.team); });
  people=src.map(function(s,i){ var sv=saved[s.name]||{}; return {id:i,name:s.name,role:s.role||'',home:s.team,rating:sv.r||null,rating0:sv.r||null,note:sv.n||''}; });
  var cols=Math.max(1,Math.floor((Math.max(window.innerWidth,700)-20)/(ZW+30))), x0=20, rowY=16, rowH=0;
  zones=names.map(function(n,zi){
    var mem=people.filter(function(p){return p.home===n;}), h=HEAD+Math.ceil(mem.length/2)*(CH+8)+44;
    if(zi>0 && zi%cols===0){ rowY+=rowH+30; rowH=0; }
    var z={name:n,x:x0+(zi%cols)*(ZW+30),y:rowY,w:ZW,h:h}; rowH=Math.max(rowH,h);
    mem.forEach(function(p,i){ p.x=z.x+12+(i%2)*(CW+10); p.y=z.y+HEAD+Math.floor(i/2)*(CH+8); });
    return z;
  });
  BW=Math.max(window.innerWidth-2, x0+cols*(ZW+30)); BH=Math.max(500, rowY+rowH+60);
  board.style.width=BW+'px'; board.style.height=BH+'px';
  if(!zones.length){ board.innerHTML='<div class="empty">Charge d\'abord le fichier de planning.</div>'; refresh(); return; }
  buildDom(); refresh();
}
function buildDom(){
  zones.forEach(function(z){
    var e=document.createElement('section'); e.className='zone';
    e.innerHTML='<div class="z-head"><div><div class="z-name">'+esc(z.name)+'</div><div class="z-sub"></div></div><div class="z-score"><span class="big num"></span><span class="dl num"></span></div></div><div class="z-dist"><i class="a1"></i><i class="a2"></i><i class="a3"></i></div><div class="z-warn" hidden></div><div class="grow" title="Redimensionner"></div>';
    board.appendChild(e); z.el=e;
    dragger(e.querySelector('.z-head'),function(){
      var inside=people.filter(function(p){return teamOf(p)===z;}), sx=z.x, sy=z.y, ps=inside.map(function(p){return [p,p.x,p.y];});
      return function(dx,dy){ z.x=clamp(sx+dx,0,BW-z.w); z.y=clamp(sy+dy,0,BH-z.h); var rx=z.x-sx, ry=z.y-sy; ps.forEach(function(a){a[0].x=a[1]+rx;a[0].y=a[2]+ry;}); place(); };
    });
    dragger(e.querySelector('.grow'),function(){
      var sw=z.w, sh=z.h;
      return function(dx,dy){ z.w=clamp(sw+dx,200,BW-z.x); z.h=clamp(sh+dy,120,BH-z.y); place(); refresh(); };
    });
  });
  people.forEach(function(p){
    var e=document.createElement('div'); e.className='chip'; e.tabIndex=0; board.appendChild(e); p.el=e;
    e.innerHTML='<div class="c-name"></div><div class="c-row"><span class="c-role"></span><span class="rate">'+[1,2,3].map(function(n){return '<button type="button" data-n="'+n+'" title="'+n+' · '+LV[n]+'">'+n+'</button>';}).join('')+'<button class="nb" type="button" title="Note">✎</button></span></div>';
    e.querySelector('.c-name').textContent=p.name;
    e.querySelectorAll('[data-n]').forEach(function(b){ b.addEventListener('pointerdown',function(ev){ev.stopPropagation();}); b.onclick=function(){ var n=+b.dataset.n; p.rating=(p.rating===n)?null:n; save(); refresh(); }; });
    var nb=e.querySelector('.nb'); nb.addEventListener('pointerdown',function(ev){ev.stopPropagation();}); nb.onclick=function(){ openNote(p); };
    dragger(e,function(){
      var sx=p.x, sy=p.y; closePop(); e.classList.add('drag'); e.style.zIndex=++zTop;
      return function(dx,dy){ p.x=clamp(sx+dx,0,BW-CW); p.y=clamp(sy+dy,0,BH-CH); place(); refresh(true); };
    },function(){ e.classList.remove('drag'); refresh(); });
  });
  place();
}
function dragger(el,start,end){
  el.addEventListener('pointerdown',function(ev){
    if(ev.button>0) return; ev.preventDefault();
    var ox=ev.clientX, oy=ev.clientY, move=start();
    el.setPointerCapture(ev.pointerId);
    function mv(e){ move(e.clientX-ox,e.clientY-oy); }
    function up(){ el.removeEventListener('pointermove',mv); el.removeEventListener('pointerup',up); el.removeEventListener('pointercancel',up); if(end) end(); }
    el.addEventListener('pointermove',mv); el.addEventListener('pointerup',up); el.addEventListener('pointercancel',up);
  });
}
function teamOf(p){
  var cx=p.x+CW/2, cy=p.y+CH/2, hit=null;
  zones.forEach(function(z){ if(cx>=z.x&&cx<=z.x+z.w&&cy>=z.y&&cy<=z.y+z.h) hit=z; });
  return hit;
}
function place(){
  zones.forEach(function(z){ var s=z.el.style; s.left=z.x+'px'; s.top=z.y+'px'; s.width=z.w+'px'; s.height=z.h+'px'; });
  people.forEach(function(p){ p.el.style.left=p.x+'px'; p.el.style.top=p.y+'px'; });
}
function stats(list){
  var c={1:0,2:0,3:0},n=0,sum=0; list.forEach(function(p){ if(p.rating){c[p.rating]++;n++;sum+=p.rating;} });
  return {n:list.length,rated:n,c:c,avg:n?sum/n:null};
}
function refresh(dragging){
  var base={}; zones.forEach(function(z){ base[z.name]=stats(people.filter(function(p){return p.home===z.name&&p.rating0;}).map(function(p){return {rating:p.rating0};})).avg; });
  var moved=0,out=0,hover=null;
  people.forEach(function(p){
    var z=teamOf(p); p.team=z?z.name:null; if(!z) out++; else if(z.name!==p.home) moved++;
    if(dragging&&p.el.classList.contains('drag')) hover=z;
    var e=p.el; e.className='chip'+(p.rating?' r'+p.rating:' norate')+(e.classList.contains('drag')?' drag':'');
    e.querySelectorAll('[data-n]').forEach(function(b){ b.className=(p.rating===+b.dataset.n)?'on'+b.dataset.n:''; });
    e.querySelector('.nb').className='nb'+(p.note?' has':'');
    e.querySelector('.c-role').innerHTML=esc(p.role||'—')+(z&&z.name!==p.home?' · <em>de '+esc(p.home)+'</em>':(!z?' · <em>hors équipe</em>':''));
    e.title=p.name+' · '+(p.role||'—')+' · '+(p.rating?LV[p.rating]:'non noté')+(p.note?'\n'+p.note:'');
  });
  var all=[];
  zones.forEach(function(z){
    var list=people.filter(function(p){return p.team===z.name;}), s=stats(list); all=all.concat(list);
    var q=z.el.querySelector.bind(z.el);
    z.el.classList.toggle('over',hover===z);
    q('.z-sub').textContent=s.n+' équipier'+(s.n>1?'s':'');
    q('.big').textContent=f1(s.avg);
    var d=(s.avg!=null&&base[z.name]!=null)?s.avg-base[z.name]:null, dl=q('.dl');
    if(d!=null&&Math.abs(d)>=0.05){dl.textContent=(d>0?'+':'−')+f1(Math.abs(d)); dl.className='dl num '+(d>0?'up':'down');} else {dl.textContent='= départ'; dl.className='dl num';}
    var t=s.rated||1; q('.a1').style.width=s.c[1]/t*100+'%'; q('.a2').style.width=s.c[2]/t*100+'%'; q('.a3').style.width=s.c[3]/t*100+'%';
    q('.z-dist').title='Junior '+s.c[1]+' · Intermédiaire '+s.c[2]+' · Senior '+s.c[3];
    var w=q('.z-warn'), u=s.n-s.rated; w.hidden=!u; w.textContent=u+' non noté'+(u>1?'s':'');
  });
  root.querySelector('#rg-avg').textContent=f1(stats(all).avg);
  root.querySelector('#rg-moved').textContent=moved;
  root.querySelector('#rg-out').textContent=out;
}
function closePop(){ if(pop){pop.remove();pop=null;} }
function openNote(p){
  closePop();
  pop=document.createElement('div'); pop.className='pop';
  pop.innerHTML='<b>'+esc(p.name)+'</b><textarea placeholder="Petite note sur cet équipier…" aria-label="Note"></textarea><button class="btn" type="button">Fermer</button>';
  var t=pop.querySelector('textarea'); t.value=p.note;
  t.oninput=function(){ p.note=t.value; save(); refresh(); };
  pop.querySelector('.btn').onclick=closePop;
  pop.style.left=clamp(p.x,0,BW-210)+'px'; pop.style.top=clamp(p.y+CH+4,0,BH-130)+'px';
  board.appendChild(pop); t.focus();
}
// persons : [{name, team, role}] — l'ordre donne l'ordre des zones.
window.TKReorg={ open:function(persons){ ensureRoot(); src=persons; root.hidden=false; document.body.style.overflow='hidden'; layout(); } };
})();
