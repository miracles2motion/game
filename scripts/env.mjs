// Minimal DOM stubs so game modules can be smoke-tested in Node (no WebGL).
globalThis.window = { innerWidth: 1280, innerHeight: 720, addEventListener(){}, devicePixelRatio:1, matchMedia:()=>({matches:false}) };
Object.defineProperty(globalThis,'navigator',{value:{ maxTouchPoints: 0, userAgent: 'node' },configurable:true});
globalThis.localStorage = { getItem:()=>null, setItem(){} };
globalThis.matchMedia = () => ({ matches:false });
globalThis.document = {
  createElement(tag){ if(tag==='canvas') return { width:0,height:0, getContext:()=>new Proxy({}, {get:(t,k)=> k==='createRadialGradient'? ()=>({addColorStop(){}}) : (k==='canvas'? {width:64,height:64}: ()=>{}) }) }; return { style:{}, classList:{add(){},remove(){},toggle(){}}, appendChild(){}, querySelector:()=>null, querySelectorAll:()=>[], addEventListener(){} }; },
  addEventListener(){}, getElementById:()=>null, hidden:false,
};
