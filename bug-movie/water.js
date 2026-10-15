/* ════════════════════════════════════════════════════════════════════
   Film Stabilisation, rendu « Gouttes d'eau ».
   Chaque ticket est une particule d'un petit fluide (Clavet et al. 2005,
   relaxation double densité) : les gouttes d'une même case se rejoignent en
   une flaque qui s'étale et ondule. Quand un ticket change de case, sa goutte
   vole jusqu'à la nouvelle et éclabousse ; sortie de version : elle s'évapore
   vers le nuage ; rejetée : elle tombe dans la poubelle.
   Rendu WebGL2 : un champ de densité (taches additives, découpées aux murs de
   chaque case) puis un éclairage (reflets, profondeur, ligne de surface).
   ════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  var WATER = { sh: [0.365, 0.702, 0.957], dp: [0.059, 0.290, 0.659], rim: [0.914, 0.965, 1] };

  function supported() {
    try { var c = document.createElement('canvas'); return !!c.getContext('webgl2'); } catch (e) { return false; }
  }

  function create(glCanvas) {
    var gl = glCanvas.getContext('webgl2', { premultipliedAlpha: true, alpha: true, antialias: false });
    if (!gl) return null;
    var S = { R: 8, g: .06, k: .35, kn: 1.2, rho0: 1.6, sigma: .05, beta: .25 };
    var P = [], spray = [], ripples = [], geo = null, dpr = 1, R3 = null, snapNext = true;

    // ── Fluide ────────────────────────────────────────────────────────
    function live(p) { return p.mode === 'pool' || p.mode === 'fly'; }
    function step() {
      var h = S.R * 2, by = {}, i;
      P.forEach(function (p) { if (p.mode === 'pool') (by[p.cell] = by[p.cell] || []).push(p); });
      P.forEach(function (p) { if (live(p)) p.vy += S.g; });
      Object.keys(by).forEach(function (key) {
        var L = by[key], n = L.length, m = 0, j, a, b, dx, dy, d, q, u, I;
        // les gouttes d'une case glissent vers la flaque : une seule flaque par case
        L.forEach(function (p) { m += p.x; }); m /= n;
        L.forEach(function (p) { p.vx += Math.max(-.03, Math.min(.03, (m - p.x) * .0004)); });
        // viscosité : impulsions entre voisins qui se rapprochent
        for (i = 0; i < n; i++) for (j = i + 1; j < n; j++) {
          a = L[i]; b = L[j]; dx = b.x - a.x; dy = b.y - a.y; d = Math.sqrt(dx * dx + dy * dy);
          if (d >= h || d < 1e-6) continue; q = d / h; dx /= d; dy /= d;
          u = (a.vx - b.vx) * dx + (a.vy - b.vy) * dy;
          if (u > 0) { I = (1 - q) * (S.sigma * u + S.beta * u * u) * .5; a.vx -= I * dx; a.vy -= I * dy; b.vx += I * dx; b.vy += I * dy; }
        }
      });
      P.forEach(function (p) { p.px = p.x; p.py = p.y; if (live(p)) { p.x += p.vx; p.y += p.vy; } });
      Object.keys(by).forEach(function (key) {      // pression + pression proche (tension de surface)
        var L = by[key], n = L.length, j, a, b, dx, dy, d, q, rho, rhon, Pr, Pn, D, sx, sy;
        for (i = 0; i < n; i++) {
          a = L[i]; rho = 0; rhon = 0;
          for (j = 0; j < n; j++) { if (j === i) continue; b = L[j]; dx = b.x - a.x; dy = b.y - a.y; d = Math.sqrt(dx * dx + dy * dy); if (d >= h) continue; q = 1 - d / h; rho += q * q; rhon += q * q * q; }
          Pr = S.k * (rho - S.rho0); Pn = S.kn * rhon; sx = 0; sy = 0;
          for (j = 0; j < n; j++) {
            if (j === i) continue; b = L[j]; dx = b.x - a.x; dy = b.y - a.y; d = Math.sqrt(dx * dx + dy * dy);
            if (d >= h) continue; if (d < 1e-6) { dx = Math.random() - .5; dy = -.5; d = 1; }
            q = 1 - d / h; D = (Pr * q + Pn * q * q) * .5 / d;
            b.x += D * dx; b.y += D * dy; sx -= D * dx; sy -= D * dy;
          }
          a.x += sx; a.y += sy;
        }
      });
      P.forEach(function (p) {
        if (p.mode === 'pool') {
          var B = geo.cells[p.cell], r = S.R * .5;
          if (p.x < B.x0 + r) p.x = B.x0 + r; if (p.x > B.x1 - r) p.x = B.x1 - r;
          if (p.y > B.y1 - r) { p.y = B.y1 - r; p.x = p.px + (p.x - p.px) * .7; }   // frottement sur le fond
          if (p.y < B.y0 + r) p.y = B.y0 + r;
        }
        if (live(p)) { p.vx = p.x - p.px; p.vy = p.y - p.py; }
        if (p.mode === 'fly') land(p);
      });
      for (i = spray.length - 1; i >= 0; i--) { var s = spray[i]; s.vy += S.g; s.x += s.vx; s.y += s.vy; if (--s.life <= 0 || s.y > s.floor) spray.splice(i, 1); }
    }
    function launch(p, xt, yt) {                     // tir balistique qui passe au-dessus des murs
      var ya = Math.max(8, Math.min(p.y, yt) - 30 - Math.abs(xt - p.x) * .1);
      var vy0 = -Math.sqrt(2 * S.g * Math.max(0, p.y - ya)), tu = -vy0 / S.g, td = Math.sqrt(2 * Math.max(1, yt - ya) / S.g);
      p.vx = (xt - p.x) / (tu + td); p.vy = vy0; p.mode = 'fly'; p.ft = 0; p.size = 1;
    }
    function land(p) {
      p.ft++;
      if (p.dest === 'board') {
        var B = geo.cells[p.cell];
        if (p.vy > 0 && p.x > B.x0 && p.x < B.x1 && p.y > B.y0 + 3) {
          p.mode = 'pool';
          var sp = Math.hypot(p.vx, p.vy);
          if (sp > 1.4) {                            // éclaboussure et rond dans l'eau
            for (var k = 0, n = 4 + Math.round(Math.random() * 3); k < n; k++)
              spray.push({ x: p.x + (Math.random() - .5) * 5, y: p.y, vx: (Math.random() - .5) * 2.2 + p.vx * .25, vy: -(.8 + Math.random() * 1.3) * Math.min(sp, 4.5) / 2.6, r: .32 + Math.random() * .16, life: 70, floor: B.y1 - 2, cell: p.cell });
            ripples.push({ x: p.x, y: p.y, t: 0 });
          }
        } else if (p.ft > 600) { p.x = (B.x0 + B.x1) / 2; p.y = B.y0 + 8; }
      } else if (p.dest === 'trash' && p.vy > 0 && p.y >= geo.trash.y - 6) { p.mode = 'drain'; p.t = 0; p.sx = p.x; p.sy = p.y; }
    }

    // ── Tickets : chaque appel donne la place de chaque ticket ───────
    // list[id] = null (absent) ou { kind: 'board' | 'cloud' | 'trash', cell: 'ligne:colonne' }
    function placeIn(p, cell) { var B = geo.cells[cell]; p.x = B.x0 + 4 + Math.random() * (B.x1 - B.x0 - 8); p.y = B.y1 - 4 - Math.random() * 20; p.vx = p.vy = 0; p.mode = 'pool'; p.size = 1; }
    function sync(list) {
      if (!geo) return;
      var snap = snapNext; snapNext = false;
      if (snap) { spray = []; ripples = []; }
      for (var id = 0; id < list.length; id++) {
        var w = list[id], key = !w ? 'none' : w.kind === 'board' ? 'b' + w.cell : w.kind, p = P[id];
        if (!p) p = P[id] = { mode: 'hidden', key: 'none', x: 0, y: 0, vx: 0, vy: 0, px: 0, py: 0, size: 1 };
        if (!snap && p.key === key) continue;
        var from = p.key; p.key = key; p.dest = w ? w.kind : 'cloud';
        if (w && w.kind === 'board') p.cell = w.cell;
        if (snap) { if (w && w.kind === 'board') placeIn(p, w.cell); else p.mode = 'hidden'; continue; }
        var visible = p.mode !== 'hidden';
        if (p.dest === 'board') {
          if (!visible) { var o = from === 'trash' ? geo.trash : geo.cloud; p.x = o.x + (Math.random() - .5) * 20; p.y = o.y + 6; }   // pluie du nuage (ou retour de la poubelle)
          var B = geo.cells[p.cell];
          launch(p, B.x0 + 8 + Math.random() * Math.max(1, B.x1 - B.x0 - 16), B.y0 + 10);
        } else if (!visible) p.mode = 'hidden';
        else if (p.dest === 'cloud') { p.mode = 'vapor'; p.t = 0; p.sx = p.x; p.sy = p.y; }
        else launch(p, geo.trash.x + (Math.random() - .5) * 10, geo.trash.y - 4);
      }
      for (id = list.length; id < P.length; id++) P[id].mode = 'hidden';
      if (snap) for (var k = 0; k < 300; k++) step();
    }
    var acc = 0;
    function tick(dt) {
      if (!geo) return;
      dt = Math.min(.05, dt); acc += dt;
      var n = 0; while (acc >= 1 / 120 && n < 5) { step(); acc -= 1 / 120; n++; } if (n >= 5) acc = 0;
      P.forEach(function (p) {
        if (p.mode === 'vapor') {                    // évaporation : monte en rétrécissant vers le nuage
          p.t += dt / 1.4; var e = p.t * p.t * (3 - 2 * p.t);
          p.x = p.sx + (geo.cloud.x - p.sx) * e + Math.sin(p.t * 9) * 5 * (1 - p.t); p.y = p.sy + (geo.cloud.y - p.sy) * e; p.size = 1 - p.t * .95;
          if (p.t >= 1) { p.mode = 'hidden'; p.size = 1; }
        } else if (p.mode === 'drain') {             // avalée par la poubelle
          p.t += dt / .5; p.x = p.sx + (geo.trash.x - p.sx) * p.t; p.y = p.sy + (geo.trash.y + 6 - p.sy) * p.t; p.size = 1 - p.t;
          if (p.t >= 1) { p.mode = 'hidden'; p.size = 1; }
        }
      });
      for (var i = ripples.length - 1; i >= 0; i--) { ripples[i].t += dt / .9; if (ripples[i].t >= 1) ripples.splice(i, 1); }
      draw();
    }

    // ── Rendu WebGL2 ──────────────────────────────────────────────────
    function sh(type, src) { var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; }
    function prog(vs, fs) { var p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p)); return p; }
    try {
      var half = !!gl.getExtension('EXT_color_buffer_float');
      var splat = prog(
        '#version 300 es\nin vec3 a;uniform vec2 u_res;uniform float u_dpr;\nvoid main(){gl_Position=vec4(a.x/u_res.x*2.-1.,1.-a.y/u_res.y*2.,0.,1.);gl_PointSize=a.z*2.*u_dpr;}',
        '#version 300 es\nprecision highp float;uniform float u_str;out vec4 o;\nvoid main(){vec2 c=gl_PointCoord*2.-1.;float d=dot(c,c);if(d>1.)discard;float w=1.-d;o=vec4(w*w*w*u_str,0.,0.,1.);}');
      var shade = prog(
        '#version 300 es\nvoid main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));gl_Position=vec4(p*2.-1.,0.,1.);}',
        ['#version 300 es', 'precision highp float;',
          'uniform sampler2D u_f;uniform vec2 u_px;uniform float u_str,u_dpr,u_T;uniform vec3 u_sh,u_dp,u_rim;out vec4 o;',
          'float F(vec2 uv){return texture(u_f,uv).r/u_str;}',
          'void main(){',
          ' vec2 uv=gl_FragCoord.xy*u_px; float f=F(uv);',
          ' float a=smoothstep(u_T-.05,u_T+.05,f); if(a<.002){o=vec4(0.);return;}',
          ' vec2 e=u_px*2.*u_dpr;',
          ' float tl=F(uv+vec2(-e.x,e.y)),tc=F(uv+vec2(0.,e.y)),tr=F(uv+e),ml=F(uv-vec2(e.x,0.)),mr=F(uv+vec2(e.x,0.)),bl=F(uv-e),bc=F(uv-vec2(0.,e.y)),br=F(uv+vec2(e.x,-e.y));',
          ' float gx=(tr+2.*mr+br-tl-2.*ml-bl)*.25, gy=(tl+2.*tc+tr-bl-2.*bc-br)*.25;',
          // dans la masse on voit le flanc plat de l'eau : la pente ne compte que près du bord
          ' float bw=1.-smoothstep(u_T,u_T+.7,f);',
          ' vec3 n=normalize(vec3(-gx*8.*bw,-gy*8.*bw,1.));',
          // profondeur : y a-t-il encore de l'eau au-dessus de ce point ?
          ' float dp=0.; for(int k=1;k<=10;k++){dp+=smoothstep(u_T-.12,u_T+.12,F(uv+vec2(0.,float(k)*3.5*u_dpr*u_px.y)));} dp/=10.;',
          ' float th=clamp((f-u_T)/1.4,0.,1.);',
          ' vec3 col=mix(u_sh,u_dp,clamp(.12+.5*dp+.3*th,0.,1.));',
          ' vec3 L=normalize(vec3(-.45,.68,.6)), Hh=normalize(L+vec3(0.,0.,1.));',
          ' float nh=max(dot(n,Hh),0.);',
          ' float sp=pow(nh,30.)*.45+pow(nh,140.)*1.1;',
          ' col*=.8+.2*max(dot(n,L),0.);',
          ' float lit=.55+.45*clamp(dot(normalize(n.xy+1e-4),normalize(L.xy)),-1.,1.);',
          ' float fr=pow(1.-n.z,1.8); col=mix(col,u_rim,fr*.55*lit);',
          // ligne de surface : juste sous l'air, l'eau renvoie la lumière
          ' float up1=step(u_T,F(uv+vec2(0.,2.5*u_dpr*u_px.y))), up2=step(u_T,F(uv+vec2(0.,5.*u_dpr*u_px.y)));',
          ' col=mix(col,u_rim,(1.-up2)*.35+(1.-up1)*.3);',
          ' float edge=1.-smoothstep(u_T,u_T+.14,f); col=mix(col,u_dp*.7,edge*.22);',
          ' float al=a*.9;',
          ' o=vec4(col*al+vec3(sp)*a, max(al,min(1.,sp*a)));',
          '}'].join('\n'));
      var tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      var fbo = gl.createFramebuffer(), buf = gl.createBuffer(), vao = gl.createVertexArray();
      gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      var loc = gl.getAttribLocation(splat, 'a'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 0, 0);
      gl.bindVertexArray(null);
      var U = function (p, names) { var o = {}; names.forEach(function (n) { o[n] = gl.getUniformLocation(p, n); }); return o; };
      R3 = { half: half, splat: splat, shade: shade, tex: tex, fbo: fbo, buf: buf, vao: vao, tw: 0, th: 0, str: half ? 1 : .25,
        us: U(splat, ['u_res', 'u_dpr', 'u_str']), uf: U(shade, ['u_f', 'u_px', 'u_str', 'u_dpr', 'u_T', 'u_sh', 'u_dp', 'u_rim']) };
    } catch (err) { console.warn(err); return null; }

    function sizeTex() {
      var w = glCanvas.width, h = glCanvas.height; if (R3.tw === w && R3.th === h) return;
      gl.bindTexture(gl.TEXTURE_2D, R3.tex);
      if (R3.half) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
      else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, R3.fbo); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, R3.tex, 0);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE && R3.half) { R3.half = false; R3.str = .25; return sizeTex(); }
      R3.tw = w; R3.th = h;
    }
    function draw() {
      sizeTex();
      var rr = S.R * 1.6, grp = { free: [] };
      P.forEach(function (p) {
        if (p.mode === 'hidden') return;
        if (p.mode === 'pool') { (grp[p.cell] = grp[p.cell] || []).push(p.x, p.y, rr); return; }
        if (p.mode === 'fly') grp.free.push(p.x, p.y, rr * .92, p.x - p.vx * 1.3, p.y - p.vy * 1.3, rr * .7, p.x - p.vx * 2.6, p.y - p.vy * 2.6, rr * .45);   // goutte en poire
        else grp.free.push(p.x, p.y, rr * Math.max(.05, p.size));
      });
      spray.forEach(function (s) { (grp[s.cell] = grp[s.cell] || []).push(s.x, s.y, rr * s.r); });
      var Wc = geo.W, Hc = geo.H;
      gl.bindFramebuffer(gl.FRAMEBUFFER, R3.fbo); gl.viewport(0, 0, R3.tw, R3.th);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
      gl.useProgram(R3.splat); gl.bindVertexArray(R3.vao); gl.bindBuffer(gl.ARRAY_BUFFER, R3.buf);
      gl.uniform2f(R3.us.u_res, Wc, Hc); gl.uniform1f(R3.us.u_dpr, dpr); gl.uniform1f(R3.us.u_str, R3.str);
      Object.keys(grp).forEach(function (k) {
        var a = grp[k]; if (!a.length) return;
        if (k === 'free') gl.disable(gl.SCISSOR_TEST);
        else {                                       // découpe aux murs et au fond de la case : la goutte s'y écrase
          var B = geo.cells[k]; gl.enable(gl.SCISSOR_TEST);
          gl.scissor(Math.round(B.x0 * dpr), Math.round((Hc - B.y1) * dpr), Math.round((B.x1 - B.x0) * dpr), Math.round((B.y1 - B.y0 + 30) * dpr));
        }
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(a), gl.STREAM_DRAW); gl.drawArrays(gl.POINTS, 0, a.length / 3);
      });
      gl.disable(gl.SCISSOR_TEST); gl.bindVertexArray(null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, glCanvas.width, glCanvas.height);
      gl.clear(gl.COLOR_BUFFER_BIT); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(R3.shade); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, R3.tex);
      var u = R3.uf;
      gl.uniform1i(u.u_f, 0); gl.uniform2f(u.u_px, 1 / R3.tw, 1 / R3.th); gl.uniform1f(u.u_str, R3.str); gl.uniform1f(u.u_dpr, dpr); gl.uniform1f(u.u_T, .26);
      gl.uniform3fv(u.u_sh, WATER.sh); gl.uniform3fv(u.u_dp, WATER.dp); gl.uniform3fv(u.u_rim, WATER.rim);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    return {
      // g : { W, H, cells: { 'r:c': {x0,x1,y0,y1} }, cloud: {x,y}, trash: {x,y}, maxCell }
      layout: function (g) {
        geo = g; dpr = Math.min(2, window.devicePixelRatio || 1);
        glCanvas.width = Math.round(g.W * dpr); glCanvas.height = Math.round(g.H * dpr); glCanvas.style.width = g.W + 'px'; glCanvas.style.height = g.H + 'px';
        var k = Object.keys(g.cells)[0], B = g.cells[k], A = (B.x1 - B.x0) * (B.y1 - B.y0);
        S.R = Math.max(3.5, Math.min(15, Math.sqrt(.42 * A / (.61 * Math.max(1, g.maxCell)))));   // la case la plus remplie occupe au plus la moitié de sa hauteur
        snapNext = true;
      },
      reset: function () { P = []; spray = []; ripples = []; snapNext = true; },
      sync: sync,
      tick: tick,
      // position d'un ticket visible (pour les cibles dessinées par-dessus)
      pos: function (id) { var p = P[id]; return p && p.mode !== 'hidden' ? p : null; },
      radius: function () { return S.R * .9; },
      ripples: function () { return ripples; }
    };
  }

  root.BDV2Water = { supported: supported, create: create };
})(window);
