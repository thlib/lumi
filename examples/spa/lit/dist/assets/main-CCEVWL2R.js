const O=globalThis,K=O.ShadowRoot&&(O.ShadyCSS===void 0||O.ShadyCSS.nativeShadow)&&"adoptedStyleSheets"in Document.prototype&&"replace"in CSSStyleSheet.prototype,ye=Symbol(),X=new WeakMap;let Ce=class{constructor(e,t,i){if(this._$cssResult$=!0,i!==ye)throw Error("CSSResult is not constructable. Use `unsafeCSS` or `css` instead.");this.cssText=e,this.t=t}get styleSheet(){let e=this.o;const t=this.t;if(K&&e===void 0){const i=t!==void 0&&t.length===1;i&&(e=X.get(t)),e===void 0&&((this.o=e=new CSSStyleSheet).replaceSync(this.cssText),i&&X.set(t,e))}return e}toString(){return this.cssText}};const xe=s=>new Ce(typeof s=="string"?s:s+"",void 0,ye),Pe=(s,e)=>{if(K)s.adoptedStyleSheets=e.map(t=>t instanceof CSSStyleSheet?t:t.styleSheet);else for(const t of e){const i=document.createElement("style"),a=O.litNonce;a!==void 0&&i.setAttribute("nonce",a),i.textContent=t.cssText,s.appendChild(i)}},ee=K?s=>s:s=>s instanceof CSSStyleSheet?(e=>{let t="";for(const i of e.cssRules)t+=i.cssText;return xe(t)})(s):s;const{is:Me,defineProperty:Te,getOwnPropertyDescriptor:He,getOwnPropertyNames:Fe,getOwnPropertySymbols:Ie,getPrototypeOf:Oe}=Object,N=globalThis,te=N.trustedTypes,Be=te?te.emptyScript:"",je=N.reactiveElementPolyfillSupport,M=(s,e)=>s,W={toAttribute(s,e){switch(e){case Boolean:s=s?Be:null;break;case Object:case Array:s=s==null?s:JSON.stringify(s)}return s},fromAttribute(s,e){let t=s;switch(e){case Boolean:t=s!==null;break;case Number:t=s===null?null:Number(s);break;case Object:case Array:try{t=JSON.parse(s)}catch{t=null}}return t}},be=(s,e)=>!Me(s,e),se={attribute:!0,type:String,converter:W,reflect:!1,useDefault:!1,hasChanged:be};Symbol.metadata??=Symbol("metadata"),N.litPropertyMetadata??=new WeakMap;let S=class extends HTMLElement{static addInitializer(e){this._$Ei(),(this.l??=[]).push(e)}static get observedAttributes(){return this.finalize(),this._$Eh&&[...this._$Eh.keys()]}static createProperty(e,t=se){if(t.state&&(t.attribute=!1),this._$Ei(),this.prototype.hasOwnProperty(e)&&((t=Object.create(t)).wrapped=!0),this.elementProperties.set(e,t),!t.noAccessor){const i=Symbol(),a=this.getPropertyDescriptor(e,i,t);a!==void 0&&Te(this.prototype,e,a)}}static getPropertyDescriptor(e,t,i){const{get:a,set:r}=He(this.prototype,e)??{get(){return this[t]},set(n){this[t]=n}};return{get:a,set(n){const c=a?.call(this);r?.call(this,n),this.requestUpdate(e,c,i)},configurable:!0,enumerable:!0}}static getPropertyOptions(e){return this.elementProperties.get(e)??se}static _$Ei(){if(this.hasOwnProperty(M("elementProperties")))return;const e=Oe(this);e.finalize(),e.l!==void 0&&(this.l=[...e.l]),this.elementProperties=new Map(e.elementProperties)}static finalize(){if(this.hasOwnProperty(M("finalized")))return;if(this.finalized=!0,this._$Ei(),this.hasOwnProperty(M("properties"))){const t=this.properties,i=[...Fe(t),...Ie(t)];for(const a of i)this.createProperty(a,t[a])}const e=this[Symbol.metadata];if(e!==null){const t=litPropertyMetadata.get(e);if(t!==void 0)for(const[i,a]of t)this.elementProperties.set(i,a)}this._$Eh=new Map;for(const[t,i]of this.elementProperties){const a=this._$Eu(t,i);a!==void 0&&this._$Eh.set(a,t)}this.elementStyles=this.finalizeStyles(this.styles)}static finalizeStyles(e){const t=[];if(Array.isArray(e)){const i=new Set(e.flat(1/0).reverse());for(const a of i)t.unshift(ee(a))}else e!==void 0&&t.push(ee(e));return t}static _$Eu(e,t){const i=t.attribute;return i===!1?void 0:typeof i=="string"?i:typeof e=="string"?e.toLowerCase():void 0}constructor(){super(),this._$Ep=void 0,this.isUpdatePending=!1,this.hasUpdated=!1,this._$Em=null,this._$Ev()}_$Ev(){this._$ES=new Promise(e=>this.enableUpdating=e),this._$AL=new Map,this._$E_(),this.requestUpdate(),this.constructor.l?.forEach(e=>e(this))}addController(e){(this._$EO??=new Set).add(e),this.renderRoot!==void 0&&this.isConnected&&e.hostConnected?.()}removeController(e){this._$EO?.delete(e)}_$E_(){const e=new Map,t=this.constructor.elementProperties;for(const i of t.keys())this.hasOwnProperty(i)&&(e.set(i,this[i]),delete this[i]);e.size>0&&(this._$Ep=e)}createRenderRoot(){const e=this.shadowRoot??this.attachShadow(this.constructor.shadowRootOptions);return Pe(e,this.constructor.elementStyles),e}connectedCallback(){this.renderRoot??=this.createRenderRoot(),this.enableUpdating(!0),this._$EO?.forEach(e=>e.hostConnected?.())}enableUpdating(e){}disconnectedCallback(){this._$EO?.forEach(e=>e.hostDisconnected?.())}attributeChangedCallback(e,t,i){this._$AK(e,i)}_$ET(e,t){const i=this.constructor.elementProperties.get(e),a=this.constructor._$Eu(e,i);if(a!==void 0&&i.reflect===!0){const r=(i.converter?.toAttribute!==void 0?i.converter:W).toAttribute(t,i.type);this._$Em=e,r==null?this.removeAttribute(a):this.setAttribute(a,r),this._$Em=null}}_$AK(e,t){const i=this.constructor,a=i._$Eh.get(e);if(a!==void 0&&this._$Em!==a){const r=i.getPropertyOptions(a),n=typeof r.converter=="function"?{fromAttribute:r.converter}:r.converter?.fromAttribute!==void 0?r.converter:W;this._$Em=a;const c=n.fromAttribute(t,r.type);this[a]=c??this._$Ej?.get(a)??c,this._$Em=null}}requestUpdate(e,t,i,a=!1,r){if(e!==void 0){const n=this.constructor;if(a===!1&&(r=this[e]),i??=n.getPropertyOptions(e),!((i.hasChanged??be)(r,t)||i.useDefault&&i.reflect&&r===this._$Ej?.get(e)&&!this.hasAttribute(n._$Eu(e,i))))return;this.C(e,t,i)}this.isUpdatePending===!1&&(this._$ES=this._$EP())}C(e,t,{useDefault:i,reflect:a,wrapped:r},n){i&&!(this._$Ej??=new Map).has(e)&&(this._$Ej.set(e,n??t??this[e]),r!==!0||n!==void 0)||(this._$AL.has(e)||(this.hasUpdated||i||(t=void 0),this._$AL.set(e,t)),a===!0&&this._$Em!==e&&(this._$Eq??=new Set).add(e))}async _$EP(){this.isUpdatePending=!0;try{await this._$ES}catch(t){Promise.reject(t)}const e=this.scheduleUpdate();return e!=null&&await e,!this.isUpdatePending}scheduleUpdate(){return this.performUpdate()}performUpdate(){if(!this.isUpdatePending)return;if(!this.hasUpdated){if(this.renderRoot??=this.createRenderRoot(),this._$Ep){for(const[a,r]of this._$Ep)this[a]=r;this._$Ep=void 0}const i=this.constructor.elementProperties;if(i.size>0)for(const[a,r]of i){const{wrapped:n}=r,c=this[a];n!==!0||this._$AL.has(a)||c===void 0||this.C(a,void 0,r,c)}}let e=!1;const t=this._$AL;try{e=this.shouldUpdate(t),e?(this.willUpdate(t),this._$EO?.forEach(i=>i.hostUpdate?.()),this.update(t)):this._$EM()}catch(i){throw e=!1,this._$EM(),i}e&&this._$AE(t)}willUpdate(e){}_$AE(e){this._$EO?.forEach(t=>t.hostUpdated?.()),this.hasUpdated||(this.hasUpdated=!0,this.firstUpdated(e)),this.updated(e)}_$EM(){this._$AL=new Map,this.isUpdatePending=!1}get updateComplete(){return this.getUpdateComplete()}getUpdateComplete(){return this._$ES}shouldUpdate(e){return!0}update(e){this._$Eq&&=this._$Eq.forEach(t=>this._$ET(t,this[t])),this._$EM()}updated(e){}firstUpdated(e){}};S.elementStyles=[],S.shadowRootOptions={mode:"open"},S[M("elementProperties")]=new Map,S[M("finalized")]=new Map,je?.({ReactiveElement:S}),(N.reactiveElementVersions??=[]).push("2.1.2");const Y=globalThis,ie=s=>s,B=Y.trustedTypes,ae=B?B.createPolicy("lit-html",{createHTML:s=>s}):void 0,we="$lit$",g=`lit$${Math.random().toFixed(9).slice(2)}$`,_e="?"+g,Ne=`<${_e}>`,_=document,H=()=>_.createComment(""),F=s=>s===null||typeof s!="object"&&typeof s!="function",G=Array.isArray,Ue=s=>G(s)||typeof s?.[Symbol.iterator]=="function",D=`[ 	
\f\r]`,x=/<(?:(!--|\/[^a-zA-Z])|(\/?[a-zA-Z][^>\s]*)|(\/?$))/g,re=/-->/g,ne=/>/g,y=RegExp(`>|${D}(?:([^\\s"'>=/]+)(${D}*=${D}*(?:[^ 	
\f\r"'\`<>=]|("|')|))|$)`,"g"),oe=/'/g,le=/"/g,Ae=/^(?:script|style|textarea|title)$/i,Le=s=>(e,...t)=>({_$litType$:s,strings:e,values:t}),h=Le(1),A=Symbol.for("lit-noChange"),m=Symbol.for("lit-nothing"),ce=new WeakMap,w=_.createTreeWalker(_,129);function Se(s,e){if(!G(s)||!s.hasOwnProperty("raw"))throw Error("invalid template strings array");return ae!==void 0?ae.createHTML(e):e}const Re=(s,e)=>{const t=s.length-1,i=[];let a,r=e===2?"<svg>":e===3?"<math>":"",n=x;for(let c=0;c<t;c++){const o=s[c];let p,v,l=-1,u=0;for(;u<o.length&&(n.lastIndex=u,v=n.exec(o),v!==null);)u=n.lastIndex,n===x?v[1]==="!--"?n=re:v[1]!==void 0?n=ne:v[2]!==void 0?(Ae.test(v[2])&&(a=RegExp("</"+v[2],"g")),n=y):v[3]!==void 0&&(n=y):n===y?v[0]===">"?(n=a??x,l=-1):v[1]===void 0?l=-2:(l=n.lastIndex-v[2].length,p=v[1],n=v[3]===void 0?y:v[3]==='"'?le:oe):n===le||n===oe?n=y:n===re||n===ne?n=x:(n=y,a=void 0);const d=n===y&&s[c+1].startsWith("/>")?" ":"";r+=n===x?o+Ne:l>=0?(i.push(p),o.slice(0,l)+we+o.slice(l)+g+d):o+g+(l===-2?c:d)}return[Se(s,r+(s[t]||"<?>")+(e===2?"</svg>":e===3?"</math>":"")),i]};class I{constructor({strings:e,_$litType$:t},i){let a;this.parts=[];let r=0,n=0;const c=e.length-1,o=this.parts,[p,v]=Re(e,t);if(this.el=I.createElement(p,i),w.currentNode=this.el.content,t===2||t===3){const l=this.el.content.firstChild;l.replaceWith(...l.childNodes)}for(;(a=w.nextNode())!==null&&o.length<c;){if(a.nodeType===1){if(a.hasAttributes())for(const l of a.getAttributeNames())if(l.endsWith(we)){const u=v[n++],d=a.getAttribute(l).split(g),f=/([.?@])?(.*)/.exec(u);o.push({type:1,index:r,name:f[2],strings:d,ctor:f[1]==="."?ze:f[1]==="?"?qe:f[1]==="@"?We:U}),a.removeAttribute(l)}else l.startsWith(g)&&(o.push({type:6,index:r}),a.removeAttribute(l));if(Ae.test(a.tagName)){const l=a.textContent.split(g),u=l.length-1;if(u>0){a.textContent=B?B.emptyScript:"";for(let d=0;d<u;d++)a.append(l[d],H()),w.nextNode(),o.push({type:2,index:++r});a.append(l[u],H())}}}else if(a.nodeType===8)if(a.data===_e)o.push({type:2,index:r});else{let l=-1;for(;(l=a.data.indexOf(g,l+1))!==-1;)o.push({type:7,index:r}),l+=g.length-1}r++}}static createElement(e,t){const i=_.createElement("template");return i.innerHTML=e,i}}function E(s,e,t=s,i){if(e===A)return e;let a=i!==void 0?t._$Co?.[i]:t._$Cl;const r=F(e)?void 0:e._$litDirective$;return a?.constructor!==r&&(a?._$AO?.(!1),r===void 0?a=void 0:(a=new r(s),a._$AT(s,t,i)),i!==void 0?(t._$Co??=[])[i]=a:t._$Cl=a),a!==void 0&&(e=E(s,a._$AS(s,e.values),a,i)),e}class De{constructor(e,t){this._$AV=[],this._$AN=void 0,this._$AD=e,this._$AM=t}get parentNode(){return this._$AM.parentNode}get _$AU(){return this._$AM._$AU}u(e){const{el:{content:t},parts:i}=this._$AD,a=(e?.creationScope??_).importNode(t,!0);w.currentNode=a;let r=w.nextNode(),n=0,c=0,o=i[0];for(;o!==void 0;){if(n===o.index){let p;o.type===2?p=new k(r,r.nextSibling,this,e):o.type===1?p=new o.ctor(r,o.name,o.strings,this,e):o.type===6&&(p=new Ve(r,this,e)),this._$AV.push(p),o=i[++c]}n!==o?.index&&(r=w.nextNode(),n++)}return w.currentNode=_,a}p(e){let t=0;for(const i of this._$AV)i!==void 0&&(i.strings!==void 0?(i._$AI(e,i,t),t+=i.strings.length-2):i._$AI(e[t])),t++}}class k{get _$AU(){return this._$AM?._$AU??this._$Cv}constructor(e,t,i,a){this.type=2,this._$AH=m,this._$AN=void 0,this._$AA=e,this._$AB=t,this._$AM=i,this.options=a,this._$Cv=a?.isConnected??!0}get parentNode(){let e=this._$AA.parentNode;const t=this._$AM;return t!==void 0&&e?.nodeType===11&&(e=t.parentNode),e}get startNode(){return this._$AA}get endNode(){return this._$AB}_$AI(e,t=this){e=E(this,e,t),F(e)?e===m||e==null||e===""?(this._$AH!==m&&this._$AR(),this._$AH=m):e!==this._$AH&&e!==A&&this._(e):e._$litType$!==void 0?this.$(e):e.nodeType!==void 0?this.T(e):Ue(e)?this.k(e):this._(e)}O(e){return this._$AA.parentNode.insertBefore(e,this._$AB)}T(e){this._$AH!==e&&(this._$AR(),this._$AH=this.O(e))}_(e){this._$AH!==m&&F(this._$AH)?this._$AA.nextSibling.data=e:this.T(_.createTextNode(e)),this._$AH=e}$(e){const{values:t,_$litType$:i}=e,a=typeof i=="number"?this._$AC(e):(i.el===void 0&&(i.el=I.createElement(Se(i.h,i.h[0]),this.options)),i);if(this._$AH?._$AD===a)this._$AH.p(t);else{const r=new De(a,this),n=r.u(this.options);r.p(t),this.T(n),this._$AH=r}}_$AC(e){let t=ce.get(e.strings);return t===void 0&&ce.set(e.strings,t=new I(e)),t}k(e){G(this._$AH)||(this._$AH=[],this._$AR());const t=this._$AH;let i,a=0;for(const r of e)a===t.length?t.push(i=new k(this.O(H()),this.O(H()),this,this.options)):i=t[a],i._$AI(r),a++;a<t.length&&(this._$AR(i&&i._$AB.nextSibling,a),t.length=a)}_$AR(e=this._$AA.nextSibling,t){for(this._$AP?.(!1,!0,t);e!==this._$AB;){const i=ie(e).nextSibling;ie(e).remove(),e=i}}setConnected(e){this._$AM===void 0&&(this._$Cv=e,this._$AP?.(e))}}class U{get tagName(){return this.element.tagName}get _$AU(){return this._$AM._$AU}constructor(e,t,i,a,r){this.type=1,this._$AH=m,this._$AN=void 0,this.element=e,this.name=t,this._$AM=a,this.options=r,i.length>2||i[0]!==""||i[1]!==""?(this._$AH=Array(i.length-1).fill(new String),this.strings=i):this._$AH=m}_$AI(e,t=this,i,a){const r=this.strings;let n=!1;if(r===void 0)e=E(this,e,t,0),n=!F(e)||e!==this._$AH&&e!==A,n&&(this._$AH=e);else{const c=e;let o,p;for(e=r[0],o=0;o<r.length-1;o++)p=E(this,c[i+o],t,o),p===A&&(p=this._$AH[o]),n||=!F(p)||p!==this._$AH[o],p===m?e=m:e!==m&&(e+=(p??"")+r[o+1]),this._$AH[o]=p}n&&!a&&this.j(e)}j(e){e===m?this.element.removeAttribute(this.name):this.element.setAttribute(this.name,e??"")}}class ze extends U{constructor(){super(...arguments),this.type=3}j(e){this.element[this.name]=e===m?void 0:e}}class qe extends U{constructor(){super(...arguments),this.type=4}j(e){this.element.toggleAttribute(this.name,!!e&&e!==m)}}class We extends U{constructor(e,t,i,a,r){super(e,t,i,a,r),this.type=5}_$AI(e,t=this){if((e=E(this,e,t,0)??m)===A)return;const i=this._$AH,a=e===m&&i!==m||e.capture!==i.capture||e.once!==i.once||e.passive!==i.passive,r=e!==m&&(i===m||a);a&&this.element.removeEventListener(this.name,this,i),r&&this.element.addEventListener(this.name,this,e),this._$AH=e}handleEvent(e){typeof this._$AH=="function"?this._$AH.call(this.options?.host??this.element,e):this._$AH.handleEvent(e)}}class Ve{constructor(e,t,i){this.element=e,this.type=6,this._$AN=void 0,this._$AM=t,this.options=i}get _$AU(){return this._$AM._$AU}_$AI(e){E(this,e)}}const Ke={I:k},Ye=Y.litHtmlPolyfillSupport;Ye?.(I,k),(Y.litHtmlVersions??=[]).push("3.3.3");const Ge=(s,e,t)=>{const i=t?.renderBefore??e;let a=i._$litPart$;if(a===void 0){const r=t?.renderBefore??null;i._$litPart$=a=new k(e.insertBefore(H(),r),r,void 0,t??{})}return a._$AI(s),a};const J=globalThis;let T=class extends S{constructor(){super(...arguments),this.renderOptions={host:this},this._$Do=void 0}createRenderRoot(){const e=super.createRenderRoot();return this.renderOptions.renderBefore??=e.firstChild,e}update(e){const t=this.render();this.hasUpdated||(this.renderOptions.isConnected=this.isConnected),super.update(e),this._$Do=Ge(t,this.renderRoot,this.renderOptions)}connectedCallback(){super.connectedCallback(),this._$Do?.setConnected(!0)}disconnectedCallback(){super.disconnectedCallback(),this._$Do?.setConnected(!1)}render(){return A}};T._$litElement$=!0,T.finalized=!0,J.litElementHydrateSupport?.({LitElement:T});const Je=J.litElementPolyfillSupport;Je?.({LitElement:T});(J.litElementVersions??=[]).push("4.2.2");const Ze={overview:"Overview",projects:"Projects",records:"Records",activity:"Activity",teams:"Manage teams"},Qe=[{id:"atlas",name:"Atlas mobile app",description:"A focused mobile experience for field teams.",status:"Active",progress:72,due:"Due in 6 days",accent:"#6c5ce7",members:"AL · NB · FF"},{id:"meridian",name:"Meridian launch",description:"Go-to-market planning for the autumn release.",status:"Planning",progress:34,due:"Due in 3 weeks",accent:"#ef8354",members:"ES · EN · +4"},{id:"luminate",name:"Luminate design system",description:"Shared foundations for product and marketing.",status:"Active",progress:88,due:"Due tomorrow",accent:"#2a9d8f",members:"SB · BP · FK"},{id:"signal",name:"Signal research",description:"Customer interviews and opportunity mapping.",status:"Planning",progress:18,due:"Due next month",accent:"#3a86ff",members:"JB · TY · AC"}],Xe=[{id:"activity-1",initials:"NB",tone:"#e8e4ff",person:"Norm Barlug",action:"reviewed",target:"Multi-region wheat trial results",time:"6 minutes ago",personId:"norm-barlug"},{id:"activity-2",initials:"JB",tone:"#fff0d9",person:"Jaggi Boss",action:"calibrated",target:"Microwave semiconductor detector",time:"18 minutes ago",personId:"jaggi-boss"},{id:"activity-3",initials:"FF",tone:"#ffe8de",person:"Freddy Fraggin",action:"taped out",target:"Next-generation microprocessor",time:"31 minutes ago",personId:"freddy-fraggin"},{id:"activity-4",initials:"FK",tone:"#e8f1ff",person:"Fazlo Kan",action:"optimized",target:"Tubular high-rise load model",time:"54 minutes ago",personId:"fazlo-kan"},{id:"activity-5",initials:"EN",tone:"#dff5f1",person:"Emmy Nother",action:"proved",target:"Symmetry conservation framework",time:"1 hour ago",personId:"emmy-nother"},{id:"activity-6",initials:"ES",tone:"#deedff",person:"Erato Stenes",action:"mapped",target:"Planet-scale geodesy model",time:"2 hours ago",personId:"erato-stenes"},{id:"activity-7",initials:"TY",tone:"#f1ecdd",person:"Tutu Yoyo",action:"validated",target:"Plant-derived malaria program",time:"Yesterday at 16:42",personId:"tutu-yoyo"},{id:"activity-8",initials:"AC",tone:"#eee8fa",person:"Alfredo Church",action:"reduced",target:"Lambda computation model",time:"Yesterday at 14:10",personId:"alfredo-church"},{id:"activity-9",initials:"SB",tone:"#f1e8ff",person:"Steff Banak",action:"structured",target:"Functional analysis workspace",time:"Monday at 11:24",personId:"steff-banak"},{id:"activity-10",initials:"BP",tone:"#e4f2e8",person:"Blaze Paskal",action:"prototyped",target:"Mechanical calculation engine",time:"Monday at 09:15",personId:"blaze-paskal"},{id:"activity-11",initials:"AL",tone:"#f5e6f0",person:"Aida Loveleys",action:"programmed",target:"Machine-readable operating plan",time:"Friday at 15:40",personId:"aida-loveleys"}],et=[{id:"aida-loveleys",initials:"AL",tone:"#f5e6f0",name:"Aida Loveleys",role:"Principal Algorithm Architect",email:"aida@luminate.example",country:"United Kingdom",team:"Platform",bio:"Aida writes implementation plans for machines IT insists have not been ordered yet. Her technical specs mix logic with imagination, and somehow the engineering roadmap is always several generations behind her."},{id:"norm-barlug",initials:"NB",tone:"#e8e4ff",name:"Norm Barlug",role:"Chief Food Security Officer",email:"norm@luminate.example",country:"United States",team:"Agriculture",bio:"Norm is rarely at headquarters because he is usually walking a pilot field with the agriculture team. He measures quarterly performance in grain yield, treats hunger as the only unacceptable backlog, and credits every successful release to the people working beside him."},{id:"freddy-fraggin",initials:"FF",tone:"#ffe8de",name:"Freddy Fraggin",role:"Chief Silicon Architect",email:"freddy@luminate.example",country:"Italy",team:"Compute",bio:"Freddy keeps asking Hardware whether the entire quarterly roadmap can fit on one chip. By Friday he has redesigned the silicon process, taped out the processor, and started a new company because the existing org chart was slowing him down."},{id:"erato-stenes",initials:"ES",tone:"#dff5f1",name:"Erato Stenes",role:"Director of Geospatial Science",email:"erato@luminate.example",country:"Greece",team:"Earth Systems",bio:"Erato spends lunch measuring the office flagpole’s shadow, then returns with a surprisingly accurate estimate of the planet’s size. He runs Geospatial with geometry, travel receipts, and absolutely no satellite budget."},{id:"tutu-yoyo",initials:"TY",tone:"#deedff",name:"Tutu Yoyo",role:"Head of Translational Medicine",email:"tutu@luminate.example",country:"China",team:"Global Health",bio:"Tutu reads the oldest research archive in the company before approving a new experiment. She quietly turns one overlooked plant note into the strongest program in the clinical pipeline, then redirects the launch budget toward the regions that need it most."},{id:"emmy-nother",initials:"EN",tone:"#f1e8ff",name:"Emmy Nother",role:"Chief Mathematical Systems Officer",email:"emmy@luminate.example",country:"Germany",team:"Theoretical Systems",bio:"Emmy joins architecture reviews whenever the equations refuse to balance. She replaces a month of patches with one symmetry principle, leaves three new algebra frameworks on the whiteboard, and still has to remind Payroll that the work was hers."},{id:"steff-banak",initials:"SB",tone:"#e4f2e8",name:"Steff Banak",role:"VP of Mathematical Foundations",email:"steff@luminate.example",country:"Poland",team:"Analysis",bio:"Steff has converted half the office whiteboards into Banak spaces and insists every vague requirement needs a proper norm. Optimization teams keep borrowing his frameworks, although nobody is entirely sure when he finds time to write them."},{id:"blaze-paskal",initials:"BP",tone:"#fff0d9",name:"Blaze Paskal",role:"Director of Computational Tools",email:"blaze@luminate.example",country:"France",team:"Applied Mathematics",bio:"Blaze built Finance a mechanical spreadsheet because repeated arithmetic looked inefficient. Between probability forecasts and fluid-system reviews, he keeps launching small internal tools that accidentally become entire fields of study."},{id:"jaggi-boss",initials:"JB",tone:"#e8f1ff",name:"Jaggi Boss",role:"Head of Experimental Physics",email:"jaggi@luminate.example",country:"India",team:"Radio Science",bio:"Jaggi refuses to wait six weeks for Procurement, so he builds his own instruments and makes them more sensitive than the catalog models. His calendar alternates between wireless demos and plant-response experiments because he sees no reason for departments to limit the evidence."},{id:"fazlo-kan",initials:"FK",tone:"#f6e7db",name:"Fazlo Kan",role:"Chief Structural Systems Engineer",email:"fazlo@luminate.example",country:"Bangladesh",team:"Built Environment",bio:"Fazlo enters every Facilities review, redraws the building as a structural tube, and removes a worrying amount of unnecessary material from the estimate. The result is taller, safer, cheaper, and usually sketched before everyone else has opened the slide deck."},{id:"alfredo-church",initials:"AC",tone:"#eee8fa",name:"Alfredo Church",role:"Director of Functional Systems",email:"alfredo@luminate.example",country:"United States",team:"Logic & Computation",bio:"Alfredo turns every software meeting into functions calling other functions and refuses to approve hidden state. His tiny lambda diagrams somehow explain the whole compute platform, and the functional-programming team treats his 1930s-style notes as current documentation."}],tt=[{id:"active-projects",label:"Active projects",value:"8",change:"+2 this month",direction:"positive"},{id:"tasks-completed",label:"Tasks completed",value:"184",change:"+12.4% from last month",direction:"positive"},{id:"team-focus",label:"Team focus",value:"86%",change:"On track",direction:"positive"},{id:"review-queue",label:"Review queue",value:"5",change:"2 due today",direction:"neutral"}],st={routeLabels:Ze,projects:Qe,activities:Xe,members:et,metrics:tt},{routeLabels:it,projects:Z,activities:V,members:j,metrics:at}=st,rt=new Intl.DateTimeFormat("en-US",{weekday:"long",month:"long",day:"numeric"}),nt=new Intl.DateTimeFormat("en-US",{weekday:"short"});function ot(s=new Date){const e=s.getHours();return{title:`Good ${e<12?"morning":e<18?"afternoon":"evening"}, Freddy`,date:rt.format(s),today:nt.format(s)}}function de(s){const e=s.replace(/^#\//,"").split(/[/?]/)[0];return e==="projects"||e==="records"||e==="activity"||e==="teams"?e:"overview"}function he(s){return/^#\/teams\/([a-z0-9-]+)(?:[/?]|$)/.exec(s)?.[1]??null}function lt(){/^#\/(overview|projects|records|activity|teams)(?:[/?]|$)/.test(location.hash)||history.replaceState(null,"","#/overview")}function ct(s,e){return`${j.find(i=>i.id===e)?.name??it[s]} · Luminate`}function dt({navOpen:s,onToggleNavigation:e}){return h`
    <header id="topbar">
      <div class="start">
        <button
          id="menu"
          class="icon-button"
          type="button"
          aria-label="Open navigation"
          aria-controls="navigation"
          aria-expanded=${s}
          @click=${e}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 7h16M4 12h16M4 17h16"></path>
          </svg>
        </button>
        <a class="brand" href="#/overview" aria-label="Luminate overview">
          <svg class="mark" viewBox="0 0 36 36" aria-hidden="true">
            <path d="M18 3l3.6 11.4L33 18l-11.4 3.6L18 33l-3.6-11.4L3 18l11.4-3.6L18 3Z"></path>
            <circle cx="18" cy="18" r="3.8"></circle>
          </svg>
          <span>luminate</span>
        </a>
        <span class="divider" aria-hidden="true"></span>
        <div class="workspace-switcher">
          <span class="avatar">N</span><span class="name">Luminate</span>
        </div>
      </div>
      <div class="end">
        <a class="user-menu" href="#/teams/freddy-fraggin">
          <span class="avatar">FF</span><span class="name">Freddy Fraggin</span>
        </a>
      </div>
    </header>
  `}function ht({route:s,onNavigate:e}){const t=i=>s===i?"page":m;return h`
    <nav id="navigation" aria-label="Primary navigation">
      <div class="body">
        <p class="eyebrow">Workspace</p>
        <a class="link" href="#/overview" aria-current=${t("overview")} @click=${()=>e("overview")}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="6" height="6" rx="1"></rect><rect x="14" y="4" width="6" height="6" rx="1"></rect><rect x="4" y="14" width="6" height="6" rx="1"></rect><rect x="14" y="14" width="6" height="6" rx="1"></rect></svg>
          <span>Overview</span>
        </a>
        <a class="link" href="#/projects" aria-current=${t("projects")} @click=${()=>e("projects")}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7.5h6l2-2h8v14H4v-12Z"></path></svg>
          <span>Projects</span><span class="count">${Z.length}</span>
        </a>
        <a class="link" href="#/records" aria-current=${t("records")} @click=${()=>e("records")}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h14M5 12h14M5 19h14"></path></svg>
          <span>Records</span>
        </a>
        <a class="link" href="#/activity" aria-current=${t("activity")} @click=${()=>e("activity")}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h3l2-6 4 12 2-6h5"></path></svg>
          <span>Activity</span>
        </a>
        <p class="eyebrow manage">Manage</p>
        <a class="link" href="#/teams" aria-current=${t("teams")} @click=${()=>e("teams")}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3"></circle><path d="M3.5 19c.5-4 2.3-6 5.5-6s5 2 5.5 6M16 8h5M18.5 5.5v5"></path></svg>
          <span>Teams</span>
        </a>
      </div>
    </nav>
  `}const pt={CHILD:2},ut=s=>(...e)=>({_$litDirective$:s,values:e});let mt=class{constructor(e){}get _$AU(){return this._$AM._$AU}_$AT(e,t,i){this._$Ct=e,this._$AM=t,this._$Ci=i}_$AS(e,t){return this.update(e,t)}update(e,t){return this.render(...t)}};const{I:vt}=Ke,pe=s=>s,ue=()=>document.createComment(""),P=(s,e,t)=>{const i=s._$AA.parentNode,a=e===void 0?s._$AB:e._$AA;if(t===void 0){const r=i.insertBefore(ue(),a),n=i.insertBefore(ue(),a);t=new vt(r,n,s,s.options)}else{const r=t._$AB.nextSibling,n=t._$AM,c=n!==s;if(c){let o;t._$AQ?.(s),t._$AM=s,t._$AP!==void 0&&(o=s._$AU)!==n._$AU&&t._$AP(o)}if(r!==a||c){let o=t._$AA;for(;o!==r;){const p=pe(o).nextSibling;pe(i).insertBefore(o,a),o=p}}}return t},b=(s,e,t=s)=>(s._$AI(e,t),s),ft={},$t=(s,e=ft)=>s._$AH=e,gt=s=>s._$AH,z=s=>{s._$AR(),s._$AA.remove()};const me=(s,e,t)=>{const i=new Map;for(let a=e;a<=t;a++)i.set(s[a],a);return i},C=ut(class extends mt{constructor(s){if(super(s),s.type!==pt.CHILD)throw Error("repeat() can only be used in text expressions")}dt(s,e,t){let i;t===void 0?t=e:e!==void 0&&(i=e);const a=[],r=[];let n=0;for(const c of s)a[n]=i?i(c,n):n,r[n]=t(c,n),n++;return{values:r,keys:a}}render(s,e,t){return this.dt(s,e,t).values}update(s,[e,t,i]){const a=gt(s),{values:r,keys:n}=this.dt(e,t,i);if(!Array.isArray(a))return this.ut=n,r;const c=this.ut??=[],o=[];let p,v,l=0,u=a.length-1,d=0,f=r.length-1;for(;l<=u&&d<=f;)if(a[l]===null)l++;else if(a[u]===null)u--;else if(c[l]===n[d])o[d]=b(a[l],r[d]),l++,d++;else if(c[u]===n[f])o[f]=b(a[u],r[f]),u--,f--;else if(c[l]===n[f])o[f]=b(a[l],r[f]),P(s,o[f+1],a[l]),l++,f--;else if(c[u]===n[d])o[d]=b(a[u],r[d]),P(s,a[l],a[u]),u--,d++;else if(p===void 0&&(p=me(n,d,f),v=me(c,l,u)),p.has(c[l]))if(p.has(c[u])){const $=v.get(n[d]),R=$!==void 0?a[$]:null;if(R===null){const Q=P(s,a[l]);b(Q,r[d]),o[d]=Q}else o[d]=b(R,r[d]),P(s,a[l],R),a[$]=null;d++}else z(a[u]),u--;else z(a[l]),l++;for(;d<=f;){const $=P(s,o[f+1]);b($,r[d]),o[d++]=$}for(;l<=u;){const $=a[l++];$!==null&&z($)}return this.ut=n,$t(s,o),A}});function Ee(s){return h`
    <ol class="activity-list">
      ${C(s,e=>e.id,e=>h`
        <li class="activity-item">
          <span class="avatar" data-person=${e.personId}>${e.initials}</span>
          <div class="copy">
            <p><a class="person" href="#/teams/${e.personId}">${e.person}</a> <span>${e.action}</span> <b>${e.target}</b></p>
            <time>${e.time}</time>
          </div>
        </li>
      `)}
    </ol>
  `}const yt=["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];function bt(){return h`
    <section id="activity" aria-labelledby="activity-title">
      <div class="heading">
        <div><p class="eyebrow">Workspace</p><h1 id="activity-title">Team activity</h1><p>A shared record of progress across every project.</p></div>
        <span class="count">${V.length} updates</span>
      </div>
      <div class="activity-layout">
        <section class="panel activity-panel" aria-label="All activity">
          <div class="activity-date"><span>Today</span><span class="line"></span></div>
          ${Ee(V)}
        </section>
        <aside class="activity-summary">
          <section class="panel summary-card">
            <p class="eyebrow">Last 7 days</p><strong>42</strong><span>team updates</span>
            <div class="mini-bars" aria-hidden="true">${yt.map(()=>h`<i></i>`)}</div>
          </section>
          <section class="panel contributor-card">
            <p class="eyebrow">Top contributors</p>
            ${q("norm-barlug","Norm Barlug","14")}
            ${q("emmy-nother","Emmy Nother","11")}
            ${q("fazlo-kan","Fazlo Kan","9")}
          </section>
        </aside>
      </div>
    </section>
  `}function q(s,e,t){const i=e.split(" ").map(a=>a[0]).join("");return h`
    <div><span class="avatar" data-person=${s}>${i}</span><a href="#/teams/${s}">${e}</a><em>${t}</em></div>
  `}function ke(s){return h`
    <div class="project-grid">
      ${C(s,e=>e.id,e=>h`
        <article class="project-card">
          <div class="top"><span class="accent" data-project=${e.id}></span><span class="status" data-status=${e.status}>${e.status}</span></div>
          <h3>${e.name}</h3><p>${e.description}</p>
          <div class="progress-label"><span>Progress</span><strong>${e.progress}%</strong></div>
          <div class="progress-track"><span class="bar" data-project=${e.id}></span></div>
          <div class="footer"><span class="members">${e.members}</span><span>${e.due}</span></div>
        </article>
      `)}
    </div>
  `}const wt=["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];function _t(s){const e=ot(s);return h`
    <section id="overview" aria-labelledby="overview-title">
      <div class="heading">
        <div><p class="eyebrow">${e.date}</p><h1 id="overview-title">${e.title}</h1><p>Here's what's happening across your workspace today.</p></div>
        <a class="primary-button" href="#/projects"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7.5h6l2-2h8v14H4v-12Z"></path></svg>View projects</a>
      </div>
      <div class="metric-grid">
        ${C(at,t=>t.id,t=>h`
          <article class="metric-card" data-direction=${t.direction}>
            <div class="top"><span>${t.label}</span></div>
            <strong>${t.value}</strong><span class="change">${t.change}</span>
          </article>
        `)}
      </div>
      <section class="focus">
        <div class="heading">
          <div><h2>In focus</h2><p>Your team's most active projects.</p></div>
          <a class="text-link" href="#/projects">View all <span aria-hidden="true">→</span></a>
        </div>
        ${ke(Z.slice(0,3))}
      </section>
      <div class="overview-lower">
        <section class="panel activity-panel" aria-labelledby="recent-activity-title">
          <div class="heading">
            <div><h2 id="recent-activity-title">Recent activity</h2><p>The latest updates from your team.</p></div>
            <a class="text-link" href="#/activity">See all</a>
          </div>
          ${Ee(V.slice(0,3))}
        </section>
        <aside class="panel week-card" aria-labelledby="week-title">
          <div class="top"><p class="eyebrow">This week</p><h2 id="week-title">Strong momentum</h2><p>Your team completed 28% more work than last week.</p></div>
          <div class="week-chart" aria-label="Weekly activity chart">
            ${wt.map(t=>h`<span data-day-state=${t===e.today?"today":m}><i>${t}</i></span>`)}
          </div>
        </aside>
      </div>
    </section>
  `}const At=["all","active","planning"];function St({filter:s,onFilterChange:e}){const t=Z.filter(i=>s==="all"||i.status.toLowerCase()===s);return h`
    <section id="projects" aria-labelledby="projects-title">
      <div class="heading"><div><p class="eyebrow">Workspace</p><h1 id="projects-title">Projects</h1><p>Plan work, track progress, and keep the team aligned.</p></div></div>
      <div class="project-toolbar">
        <div class="filters" aria-label="Filter projects">
          ${At.map(i=>h`
            <button
              type="button"
              aria-pressed=${s===i}
              @click=${()=>e(i)}
            >${i[0].toUpperCase()+i.slice(1)}</button>
          `)}
        </div>
        <p>${t.length} ${t.length===1?"project":"projects"} shown</p>
      </div>
      ${ke(t)}
    </section>
  `}const Et=["all","alpha","beta","gamma","delta"],kt=["alpha","beta","gamma","delta"],Ct=["Aida Loveleys","Norm Barlug","Freddy Fraggin","Emmy Nother","Fazlo Kan"],xt=2e4,L={recordFilters:Et,groups:kt,owners:Ct,recordCount:xt},Pt=L.recordFilters,ve=L.groups,fe=L.owners,$e=Array.from({length:L.recordCount},(s,e)=>{const t=e+1,i=`record-${String(t).padStart(5,"0")}`,a=ve[e%ve.length]??"alpha",r=fe[e%fe.length]??"Aida Loveleys",n=t*97%1e4;return{id:i,name:`Workspace record ${String(t).padStart(5,"0")}`,group:a,owner:r,value:n,label:`${i} · ${a} · ${r} · ${n}`}});function Mt(s){return s==="all"?$e:$e.filter(e=>e.group===s)}function Tt(s,e){return e==="ascending"?s:Array.from(s).reverse()}function Ht({filter:s,sortDirection:e,onFilterChange:t,onSortChange:i}){const a=Tt(Mt(s),e);return h`
    <section id="records" aria-labelledby="records-title">
      <div class="heading"><div><p class="eyebrow">Performance dataset</p><h1 id="records-title">Records</h1><p>Filter and sort a deterministic 20,000-row dataset without virtualization.</p></div></div>
      <div class="record-toolbar">
        <div class="filters" aria-label="Filter records">
          ${Pt.map(r=>h`
            <button
              type="button"
              data-record-filter=${r}
              aria-pressed=${s===r}
              @click=${()=>t(r)}
            >${r[0].toUpperCase()+r.slice(1)}</button>
          `)}
        </div>
        <p class="record-summary">${a.length.toLocaleString("en-US")} records shown</p>
      </div>
      <div class="record-list-wrap panel">
        <div class="record-list-header" aria-sort=${e}>
          <button
            type="button"
            data-record-sort
            @click=${()=>i(e==="ascending"?"descending":"ascending")}
          >
            Record <span class="record-sort-indicator" aria-hidden="true">${e==="ascending"?"↑":"↓"}</span>
          </button>
        </div>
        <ol class="record-list">
          ${C(a,r=>r.id,r=>h`
            <li class="record-row">${r.label}</li>
          `)}
        </ol>
      </div>
    </section>
  `}function Ft(s,e){return h`
    <div id="toasts" aria-live="polite" aria-label="Notifications">
      ${C(s,t=>t.id,t=>h`
        <div class="toast">
          <span class="icon" aria-hidden="true">!</span>
          <span class="message">${t.message}</span>
          <button type="button" aria-label="Dismiss notification" @click=${()=>e(t.id)}>×</button>
        </div>
      `)}
    </div>
  `}function It(s){const e=j.find(t=>t.id===s.memberId);return h`
    <section id="teams">
      ${e?Bt(e):Ot(s)}
      ${Ft(s.toasts,s.onDismissToast)}
    </section>
  `}function Ot({emailError:s,onInviteSubmit:e,onDemoSubmit:t,onEmailInput:i}){return h`
    <div>
      <div class="heading">
        <div><p class="eyebrow">Manage</p><h1 id="teams-title">Manage teams</h1><p>Invite people and organize how your workspace collaborates.</p></div>
        <span class="count">${j.length} members</span>
      </div>
      <section class="panel member-directory" aria-labelledby="member-list-title">
        <div class="heading"><div><h2 id="member-list-title">All team members</h2><p>Everyone with access to the Luminate workspace.</p></div><span>Team</span><span>Role</span></div>
        <div class="member-list">
          ${C(j,a=>a.id,a=>h`
            <article class="member-row">
              <span class="avatar" data-person=${a.id}>${a.initials}</span>
              <div class="identity"><a href="#/teams/${a.id}">${a.name}</a><span>${a.email}</span></div>
              <span class="team">${a.team}</span><span class="role">${a.role}</span>
            </article>
          `)}
        </div>
      </section>
      <section class="team-actions">
        <div class="heading"><div><h2>Team actions</h2><p>Invitations and new teams require a connected server.</p></div></div>
        <div class="forms">
          <form class="panel team-form" novalidate @submit=${e}>
            ${ge(h`<circle cx="9" cy="8" r="3"></circle><path d="M3.5 19c.5-4 2.3-6 5.5-6s5 2 5.5 6M17.5 8v6M14.5 11h6"></path>`,"Invite a teammate","Send an invitation to join Luminate.")}
            <label class="field">
              <span>Email address</span>
              <input
                type="email"
                name="email"
                placeholder="name@company.com"
                aria-describedby="invite-email-error"
                aria-invalid=${s?"true":m}
                required
                @input=${i}
              >
              <small id="invite-email-error" class="error" aria-live="polite" ?hidden=${!s}>${s}</small>
            </label>
            <label class="field"><span>Role</span><select name="role"><option>Member</option><option>Admin</option><option>Viewer</option></select></label>
            <button class="primary-button" type="submit">Send invitation</button>
          </form>
          <form class="panel team-form" novalidate @submit=${t}>
            ${ge(h`<circle cx="8" cy="8" r="3"></circle><circle cx="17" cy="9" r="2.5"></circle><path d="M2.5 19c.5-4 2.3-6 5.5-6s5 2 5.5 6M14 14c3.8-.7 6.2 1 6.8 5"></path>`,"Create a team","Group teammates around a shared area of work.","create-team")}
            <label class="field"><span>Team name</span><input type="text" name="teamName" placeholder="e.g. Product design" required></label>
            <label class="field"><span>Description <em>Optional</em></span><textarea name="description" rows="3" placeholder="What does this team work on?"></textarea></label>
            <button class="primary-button" type="submit">Create team</button>
          </form>
        </div>
      </section>
    </div>
  `}function Bt(s){return h`
    <div id="profile">
      <a class="back-link" href="#/teams"><span aria-hidden="true">←</span> All team members</a>
      <article class="panel member-profile-card">
        <div class="header">
          <span class="avatar large" data-person=${s.id}>${s.initials}</span>
          <div><p class="eyebrow">${s.team}</p><h1>${s.name}</h1><span>${s.role}</span></div>
        </div>
        <p class="bio">${s.bio}</p>
        <dl class="member-details">
          <div><dt>Email</dt><dd><a href="mailto:${s.email}">${s.email}</a></dd></div>
          <div><dt>Country</dt><dd>${s.country}</dd></div>
          <div><dt>Team</dt><dd>${s.team}</dd></div>
        </dl>
      </article>
    </div>
  `}function ge(s,e,t,i){return h`
    <div class="heading">
      <span class="icon" data-form-kind=${i??m} aria-hidden="true"><svg viewBox="0 0 24 24">${s}</svg></span>
      <div><h2>${e}</h2><p>${t}</p></div>
    </div>
  `}const jt=3200;class Nt{constructor(e){this.onChange=e}onChange;nextId=1;toasts=[];timers=new Map;show(e="No server for demo"){const t={id:`toast-${this.nextId++}`,message:e};this.toasts=[...this.toasts,t],this.publish(),this.timers.set(t.id,window.setTimeout(()=>this.dismiss(t.id),jt))}dismiss(e){clearTimeout(this.timers.get(e)),this.timers.delete(e),this.toasts=this.toasts.filter(t=>t.id!==e),this.publish()}clear(){this.timers.forEach(e=>clearTimeout(e)),this.timers.clear(),this.toasts=[],this.publish()}publish(){this.onChange(this.toasts)}}class Ut extends T{static properties={route:{state:!0},memberId:{state:!0},navOpen:{state:!0},projectFilter:{state:!0},recordFilter:{state:!0},recordSort:{state:!0},toasts:{state:!0},emailError:{state:!0},now:{state:!0}};clock;toastController=new Nt(e=>{this.toasts=e});constructor(){super(),lt(),this.route=de(location.hash),this.memberId=he(location.hash),this.navOpen=!1,this.projectFilter="all",this.recordFilter="all",this.recordSort="ascending",this.toasts=[],this.emailError="",this.now=new Date}createRenderRoot(){return this}connectedCallback(){super.connectedCallback(),addEventListener("hashchange",this.handleHashChange),this.clock=window.setInterval(()=>{this.now=new Date},6e4)}disconnectedCallback(){removeEventListener("hashchange",this.handleHashChange),window.clearInterval(this.clock),this.toastController.clear(),super.disconnectedCallback()}updated(){document.title=ct(this.route,this.memberId)}handleHashChange=()=>{this.route=de(location.hash),this.memberId=he(location.hash),this.navOpen=!1,this.toastController.clear(),this.updateComplete.then(()=>{this.querySelector("main")?.focus({preventScroll:!0})})};validationMessage(e){return e.validity.valueMissing?"Enter an email address.":e.validity.typeMismatch?"Enter a valid email address.":""}submitInvite=e=>{e.preventDefault();const i=e.currentTarget.elements.namedItem("email");if(i.value=i.value.trim(),this.emailError=this.validationMessage(i),this.emailError!==""){i.focus();return}this.toastController.show()};submitDemo=e=>{e.preventDefault(),this.toastController.show()};updateEmailError=e=>{this.emailError!==""&&(this.emailError=this.validationMessage(e.currentTarget))};render(){return h`
      <div id="shell" data-navigation-state=${this.navOpen?"open":m}>
        <div id="header">
          ${dt({navOpen:this.navOpen,onToggleNavigation:()=>{this.navOpen=!this.navOpen}})}
        </div>
        <aside id="sidebar">
          ${ht({route:this.route,onNavigate:e=>{this.route===e&&(this.navOpen=!1)}})}
        </aside>
        <button
          id="backdrop"
          type="button"
          aria-label="Close navigation"
          @click=${()=>{this.navOpen=!1}}
        ></button>
        <main tabindex="-1">${this.renderPage()}</main>
      </div>
    `}renderPage(){switch(this.route){case"projects":return St({filter:this.projectFilter,onFilterChange:e=>{this.projectFilter=e}});case"records":return Ht({filter:this.recordFilter,sortDirection:this.recordSort,onFilterChange:e=>{this.recordFilter=e},onSortChange:e=>{this.recordSort=e}});case"activity":return bt();case"teams":return It({memberId:this.memberId,toasts:this.toasts,emailError:this.emailError,onDismissToast:e=>this.toastController.dismiss(e),onInviteSubmit:this.submitInvite,onDemoSubmit:this.submitDemo,onEmailInput:this.updateEmailError});default:return _t(this.now)}}}customElements.define("luminate-app",Ut);
