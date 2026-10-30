// ── KIT DE SÍNTESIS PARA LAS DEMOS (Cotton Sugar, The Void) ────
// Todo se calcula muestra a muestra en JavaScript: sin archivos de audio, sin librerías.
function demoKit(sr,seconds,seed0){
  const n=Math.ceil(seconds*sr);
  const dr=[new Float32Array(n),new Float32Array(n)], mu=[new Float32Array(n),new Float32Array(n)];
  let seed=seed0||20261015;
  const rnd=()=>{ seed=(Math.imul(seed,1664525)+1013904223)>>>0; return seed/2147483648-1; };
  const hz=m=>440*Math.pow(2,(m-69)/12);
  const lpc=fc=>1-Math.exp(-2*Math.PI*Math.min(fc,sr*.45)/sr);
  function add(buf,t0,len,fn,amp,pan){
    const s0=Math.max(0,Math.floor(t0*sr)), N=Math.min(Math.floor(len*sr),n-s0); if(N<=0) return;
    const th=((pan||0)+1)*Math.PI/4, gl=amp*Math.cos(th)*1.414, gr=amp*Math.sin(th)*1.414;
    for(let i=0;i<N;i++){ const v=fn(i/sr); buf[0][s0+i]+=v*gl; buf[1][s0+i]+=v*gr; }
  }
  // ── percusión ──
  const kick=(t0,a,o)=>{ o=o||{}; const f1=o.lo||46, f0=o.hi||151, k=o.k||30, dec=o.dec||6.5, cl=o.click==null?.3:o.click;
    add(dr,t0,o.len||.45,t=>Math.sin(2*Math.PI*(f1*t+(f0-f1)/k*(1-Math.exp(-k*t))))*Math.exp(-t*dec)*Math.min(1,t*800)+Math.exp(-t*200)*cl,a,0); };
  const snare=(t0,a,o)=>{ o=o||{}; let p=0; const tn=o.tone||185, nd=o.nd||20, td=o.td||28;
    add(dr,t0,o.len||.25,t=>{ const x=rnd(), v=x-p*.6; p=x; return v*Math.exp(-t*nd)*.6+Math.sin(2*Math.PI*tn*t)*Math.exp(-t*td)*.5; },a,0); };
  const clap=(t0,a)=>{ let p=0; add(dr,t0,.3,t=>{ const x=rnd(), v=x-p*.7; p=x;
    return v*(Math.exp(-(t%.011)*90)*(t<.033?1:0)+Math.exp(-t*14)*.7); },a,0); };
  const snap=(t0,a,pan)=>{ let p=0; add(dr,t0,.12,t=>{ const x=rnd(), v=x-p*.9; p=x;
    return v*Math.exp(-t*55)*.8+Math.sin(2*Math.PI*1900*t)*Math.exp(-t*90)*.5; },a,pan||0); };
  const hat=(t0,a,open,pan)=>{ let p=0; add(dr,t0,open?.3:.07,t=>{ const x=rnd(), v=x-p; p=x; return v*Math.exp(-t*(open?13:75)); },a,pan||0); };
  const crash=(t0,a,len)=>{ let p=0; add(dr,t0,len||2.4,t=>{ const x=rnd(), v=x-p*.5; p=x; return v*Math.exp(-t*2.2); },a,0); };

  // ── sintetizador: w 0=sierra 1=cuadrada 2=seno · det en cents · lp en Hz o función del tiempo ──
  function syn(buf,t0,len,f,a,pan,o){
    const det=o.det||[0], D=det.length, inc=det.map(d=>f*Math.pow(2,d/1200)/sr), ph=det.map(()=>rnd()*.5+.5);
    const atk=o.atk||.004, rel=o.rel||.06, w=o.w||0, tot=len+rel;
    const lpf=typeof o.lp==='function', lpk=lpf?0:lpc(o.lp||3000);
    const dk=Math.exp(-(o.dec||0)/sr), ak=1/(atk*sr), rk=1/(rel*sr), iN=Math.floor(tot*sr), rS=iN-Math.floor(rel*sr);
    let y=0, e=1, i=0;
    add(buf,t0,tot,t=>{
      let s=0;
      for(let k=0;k<D;k++){ let p=ph[k]+inc[k]; p-=Math.floor(p); ph[k]=p;
        s+= w===0 ? 2*p-1 : w===1 ? (p<.5?1:-1) : Math.sin(6.2831853*p); }
      y+=(lpf?lpc(o.lp(t)):lpk)*(s/D-y); e*=dk; i++;
      return y*Math.min(1,i*ak)*e*(i>rS?Math.max(0,(iN-i)*rk):1);
    },a,pan);
  }
  // campana / cajita de música: parciales inarmónicos que decaen a distinta velocidad
  function bell(t0,m,a,pan,len){
    const f=hz(m), L=len||1.4, P=[[1,2.5,1],[2.76,5,.35],[5.4,9,.15]];
    add(mu,t0,L,t=>{ let s=0; for(const [r,d,g] of P) s+=Math.sin(6.2831853*f*r*t)*Math.exp(-t*d)*g; return s*Math.min(1,t*600); },a,pan);
  }
  // sílaba cantada tipo "chop": sierra filtrada por dos resonadores (formantes de la vocal)
  const bp=(fc,Q)=>{ const w=2*Math.PI*fc/sr, al=Math.sin(w)/(2*Q), a0=1+al, b0=al/a0, b2=-al/a0, a1=-2*Math.cos(w)/a0, a2=(1-al)/a0;
    let x1=0,x2=0,y1=0,y2=0; return x=>{ const y=b0*x+b2*x2-a1*y1-a2*y2; x2=x1; x1=x; y2=y1; y1=y; return y; }; };
  const VOW={oh:[500,900],ah:[800,1200],ee:[300,2300],oo:[320,800]};
  function chop(t0,len,m,a,pan,v){
    const f=hz(m), F=VOW[v||'oh'], b1=bp(F[0],6), b2=bp(F[1],8); let ph=0; const L=len+.08;
    add(mu,t0,L,t=>{ ph+=f*(1+.004*Math.sin(t*38))/sr; ph-=Math.floor(ph); const s=2*ph-1;
      return (b1(s)*1.6+b2(s))*Math.min(1,t/.012)*Math.exp(-t*(2.2/len))*Math.min(1,(L-t)/.08); },a,pan);
  }
  // ── transiciones ──
  function riser(t0,len,a){ let y=0; add(mu,t0,len,t=>{ const p=t/len, x=rnd(); y+=lpc(250+9000*p*p)*(x-y); return y*(.05+p*p*.9); },a,0); }
  function sweep(t0,len,f0,f1,a){            // seno que sube de f0 a f1
    const r=f1/f0, c=2*Math.PI*f0*len/Math.log(r);
    add(mu,t0,len,t=>Math.sin(c*(Math.pow(r,t/len)-1))*(t/len)*(t/len),a,0);
  }
  // ── mezcla: sidechain (duckAt devuelve la ganancia de la música), saturación suave, fundido, tope de nivel ──
  function mix(duckAt){
    const L=new Float32Array(n), R=new Float32Array(n), total=n/sr; let peak=0;
    const soft=x=>x<-3?-1:x>3?1:x*(27+x*x)/(27+9*x*x);
    for(let i=0;i<n;i++){
      const t=i/sr, g=duckAt(t), fade=t>total-.6?Math.max(0,(total-t)/.6):1;
      L[i]=soft((dr[0][i]+mu[0][i]*g)*.9)*fade; R[i]=soft((dr[1][i]+mu[1][i]*g)*.9)*fade;
      const a=Math.max(Math.abs(L[i]),Math.abs(R[i])); if(a>peak) peak=a;
    }
    if(peak>.92){ const k=.92/peak; for(let i=0;i<n;i++){ L[i]*=k; R[i]*=k; } }
    return {L,R,dur:total};
  }
  return {n,dr,mu,rnd,hz,lpc,add,kick,snare,clap,snap,hat,crash,syn,bell,chop,riser,sweep,mix};
}

export { demoKit };
