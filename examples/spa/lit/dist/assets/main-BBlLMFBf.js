const j=globalThis,K=j.ShadowRoot&&(j.ShadyCSS===void 0||j.ShadyCSS.nativeShadow)&&"adoptedStyleSheets"in Document.prototype&&"replace"in CSSStyleSheet.prototype,ge=Symbol(),Q=new WeakMap;let Se=class{constructor(e,t,s){if(this._$cssResult$=!0,s!==ge)throw Error("CSSResult is not constructable. Use `unsafeCSS` or `css` instead.");this.cssText=e,this.t=t}get styleSheet(){let e=this.o;const t=this.t;if(K&&e===void 0){const s=t!==void 0&&t.length===1;s&&(e=Q.get(t)),e===void 0&&((this.o=e=new CSSStyleSheet).replaceSync(this.cssText),s&&Q.set(t,e))}return e}toString(){return this.cssText}};const Ee=a=>new Se(typeof a=="string"?a:a+"",void 0,ge),ke=(a,e)=>{if(K)a.adoptedStyleSheets=e.map(t=>t instanceof CSSStyleSheet?t:t.styleSheet);else for(const t of e){const s=document.createElement("style"),i=j.litNonce;i!==void 0&&s.setAttribute("nonce",i),s.textContent=t.cssText,a.appendChild(s)}},X=K?a=>a:a=>a instanceof CSSStyleSheet?(e=>{let t="";for(const s of e.cssRules)t+=s.cssText;return Ee(t)})(a):a;const{is:Ce,defineProperty:xe,getOwnPropertyDescriptor:Te,getOwnPropertyNames:Pe,getOwnPropertySymbols:Me,getPrototypeOf:He}=Object,B=globalThis,ee=B.trustedTypes,Fe=ee?ee.emptyScript:"",Ie=B.reactiveElementPolyfillSupport,P=(a,e)=>a,V={toAttribute(a,e){switch(e){case Boolean:a=a?Fe:null;break;case Object:case Array:a=a==null?a:JSON.stringify(a)}return a},fromAttribute(a,e){let t=a;switch(e){case Boolean:t=a!==null;break;case Number:t=a===null?null:Number(a);break;case Object:case Array:try{t=JSON.parse(a)}catch{t=null}}return t}},ye=(a,e)=>!Ce(a,e),te={attribute:!0,type:String,converter:V,reflect:!1,useDefault:!1,hasChanged:ye};Symbol.metadata??=Symbol("metadata"),B.litPropertyMetadata??=new WeakMap;let E=class extends HTMLElement{static addInitializer(e){this._$Ei(),(this.l??=[]).push(e)}static get observedAttributes(){return this.finalize(),this._$Eh&&[...this._$Eh.keys()]}static createProperty(e,t=te){if(t.state&&(t.attribute=!1),this._$Ei(),this.prototype.hasOwnProperty(e)&&((t=Object.create(t)).wrapped=!0),this.elementProperties.set(e,t),!t.noAccessor){const s=Symbol(),i=this.getPropertyDescriptor(e,s,t);i!==void 0&&xe(this.prototype,e,i)}}static getPropertyDescriptor(e,t,s){const{get:i,set:r}=Te(this.prototype,e)??{get(){return this[t]},set(n){this[t]=n}};return{get:i,set(n){const c=i?.call(this);r?.call(this,n),this.requestUpdate(e,c,s)},configurable:!0,enumerable:!0}}static getPropertyOptions(e){return this.elementProperties.get(e)??te}static _$Ei(){if(this.hasOwnProperty(P("elementProperties")))return;const e=He(this);e.finalize(),e.l!==void 0&&(this.l=[...e.l]),this.elementProperties=new Map(e.elementProperties)}static finalize(){if(this.hasOwnProperty(P("finalized")))return;if(this.finalized=!0,this._$Ei(),this.hasOwnProperty(P("properties"))){const t=this.properties,s=[...Pe(t),...Me(t)];for(const i of s)this.createProperty(i,t[i])}const e=this[Symbol.metadata];if(e!==null){const t=litPropertyMetadata.get(e);if(t!==void 0)for(const[s,i]of t)this.elementProperties.set(s,i)}this._$Eh=new Map;for(const[t,s]of this.elementProperties){const i=this._$Eu(t,s);i!==void 0&&this._$Eh.set(i,t)}this.elementStyles=this.finalizeStyles(this.styles)}static finalizeStyles(e){const t=[];if(Array.isArray(e)){const s=new Set(e.flat(1/0).reverse());for(const i of s)t.unshift(X(i))}else e!==void 0&&t.push(X(e));return t}static _$Eu(e,t){const s=t.attribute;return s===!1?void 0:typeof s=="string"?s:typeof e=="string"?e.toLowerCase():void 0}constructor(){super(),this._$Ep=void 0,this.isUpdatePending=!1,this.hasUpdated=!1,this._$Em=null,this._$Ev()}_$Ev(){this._$ES=new Promise(e=>this.enableUpdating=e),this._$AL=new Map,this._$E_(),this.requestUpdate(),this.constructor.l?.forEach(e=>e(this))}addController(e){(this._$EO??=new Set).add(e),this.renderRoot!==void 0&&this.isConnected&&e.hostConnected?.()}removeController(e){this._$EO?.delete(e)}_$E_(){const e=new Map,t=this.constructor.elementProperties;for(const s of t.keys())this.hasOwnProperty(s)&&(e.set(s,this[s]),delete this[s]);e.size>0&&(this._$Ep=e)}createRenderRoot(){const e=this.shadowRoot??this.attachShadow(this.constructor.shadowRootOptions);return ke(e,this.constructor.elementStyles),e}connectedCallback(){this.renderRoot??=this.createRenderRoot(),this.enableUpdating(!0),this._$EO?.forEach(e=>e.hostConnected?.())}enableUpdating(e){}disconnectedCallback(){this._$EO?.forEach(e=>e.hostDisconnected?.())}attributeChangedCallback(e,t,s){this._$AK(e,s)}_$ET(e,t){const s=this.constructor.elementProperties.get(e),i=this.constructor._$Eu(e,s);if(i!==void 0&&s.reflect===!0){const r=(s.converter?.toAttribute!==void 0?s.converter:V).toAttribute(t,s.type);this._$Em=e,r==null?this.removeAttribute(i):this.setAttribute(i,r),this._$Em=null}}_$AK(e,t){const s=this.constructor,i=s._$Eh.get(e);if(i!==void 0&&this._$Em!==i){const r=s.getPropertyOptions(i),n=typeof r.converter=="function"?{fromAttribute:r.converter}:r.converter?.fromAttribute!==void 0?r.converter:V;this._$Em=i;const c=n.fromAttribute(t,r.type);this[i]=c??this._$Ej?.get(i)??c,this._$Em=null}}requestUpdate(e,t,s,i=!1,r){if(e!==void 0){const n=this.constructor;if(i===!1&&(r=this[e]),s??=n.getPropertyOptions(e),!((s.hasChanged??ye)(r,t)||s.useDefault&&s.reflect&&r===this._$Ej?.get(e)&&!this.hasAttribute(n._$Eu(e,s))))return;this.C(e,t,s)}this.isUpdatePending===!1&&(this._$ES=this._$EP())}C(e,t,{useDefault:s,reflect:i,wrapped:r},n){s&&!(this._$Ej??=new Map).has(e)&&(this._$Ej.set(e,n??t??this[e]),r!==!0||n!==void 0)||(this._$AL.has(e)||(this.hasUpdated||s||(t=void 0),this._$AL.set(e,t)),i===!0&&this._$Em!==e&&(this._$Eq??=new Set).add(e))}async _$EP(){this.isUpdatePending=!0;try{await this._$ES}catch(t){Promise.reject(t)}const e=this.scheduleUpdate();return e!=null&&await e,!this.isUpdatePending}scheduleUpdate(){return this.performUpdate()}performUpdate(){if(!this.isUpdatePending)return;if(!this.hasUpdated){if(this.renderRoot??=this.createRenderRoot(),this._$Ep){for(const[i,r]of this._$Ep)this[i]=r;this._$Ep=void 0}const s=this.constructor.elementProperties;if(s.size>0)for(const[i,r]of s){const{wrapped:n}=r,c=this[i];n!==!0||this._$AL.has(i)||c===void 0||this.C(i,void 0,r,c)}}let e=!1;const t=this._$AL;try{e=this.shouldUpdate(t),e?(this.willUpdate(t),this._$EO?.forEach(s=>s.hostUpdate?.()),this.update(t)):this._$EM()}catch(s){throw e=!1,this._$EM(),s}e&&this._$AE(t)}willUpdate(e){}_$AE(e){this._$EO?.forEach(t=>t.hostUpdated?.()),this.hasUpdated||(this.hasUpdated=!0,this.firstUpdated(e)),this.updated(e)}_$EM(){this._$AL=new Map,this.isUpdatePending=!1}get updateComplete(){return this.getUpdateComplete()}getUpdateComplete(){return this._$ES}shouldUpdate(e){return!0}update(e){this._$Eq&&=this._$Eq.forEach(t=>this._$ET(t,this[t])),this._$EM()}updated(e){}firstUpdated(e){}};E.elementStyles=[],E.shadowRootOptions={mode:"open"},E[P("elementProperties")]=new Map,E[P("finalized")]=new Map,Ie?.({ReactiveElement:E}),(B.reactiveElementVersions??=[]).push("2.1.2");const Y=globalThis,se=a=>a,O=Y.trustedTypes,ie=O?O.createPolicy("lit-html",{createHTML:a=>a}):void 0,be="$lit$",g=`lit$${Math.random().toFixed(9).slice(2)}$`,we="?"+g,je=`<${we}>`,A=document,H=()=>A.createComment(""),F=a=>a===null||typeof a!="object"&&typeof a!="function",G=Array.isArray,Ne=a=>G(a)||typeof a?.[Symbol.iterator]=="function",D=`[ 	
\f\r]`,x=/<(?:(!--|\/[^a-zA-Z])|(\/?[a-zA-Z][^>\s]*)|(\/?$))/g,ae=/-->/g,re=/>/g,y=RegExp(`>|${D}(?:([^\\s"'>=/]+)(${D}*=${D}*(?:[^ 	
\f\r"'\`<>=]|("|')|))|$)`,"g"),ne=/'/g,oe=/"/g,Ae=/^(?:script|style|textarea|title)$/i,Oe=a=>(e,...t)=>({_$litType$:a,strings:e,values:t}),h=Oe(1),_=Symbol.for("lit-noChange"),m=Symbol.for("lit-nothing"),le=new WeakMap,w=A.createTreeWalker(A,129);function _e(a,e){if(!G(a)||!a.hasOwnProperty("raw"))throw Error("invalid template strings array");return ie!==void 0?ie.createHTML(e):e}const Be=(a,e)=>{const t=a.length-1,s=[];let i,r=e===2?"<svg>":e===3?"<math>":"",n=x;for(let c=0;c<t;c++){const o=a[c];let p,v,l=-1,u=0;for(;u<o.length&&(n.lastIndex=u,v=n.exec(o),v!==null);)u=n.lastIndex,n===x?v[1]==="!--"?n=ae:v[1]!==void 0?n=re:v[2]!==void 0?(Ae.test(v[2])&&(i=RegExp("</"+v[2],"g")),n=y):v[3]!==void 0&&(n=y):n===y?v[0]===">"?(n=i??x,l=-1):v[1]===void 0?l=-2:(l=n.lastIndex-v[2].length,p=v[1],n=v[3]===void 0?y:v[3]==='"'?oe:ne):n===oe||n===ne?n=y:n===ae||n===re?n=x:(n=y,i=void 0);const d=n===y&&a[c+1].startsWith("/>")?" ":"";r+=n===x?o+je:l>=0?(s.push(p),o.slice(0,l)+be+o.slice(l)+g+d):o+g+(l===-2?c:d)}return[_e(a,r+(a[t]||"<?>")+(e===2?"</svg>":e===3?"</math>":"")),s]};class I{constructor({strings:e,_$litType$:t},s){let i;this.parts=[];let r=0,n=0;const c=e.length-1,o=this.parts,[p,v]=Be(e,t);if(this.el=I.createElement(p,s),w.currentNode=this.el.content,t===2||t===3){const l=this.el.content.firstChild;l.replaceWith(...l.childNodes)}for(;(i=w.nextNode())!==null&&o.length<c;){if(i.nodeType===1){if(i.hasAttributes())for(const l of i.getAttributeNames())if(l.endsWith(be)){const u=v[n++],d=i.getAttribute(l).split(g),f=/([.?@])?(.*)/.exec(u);o.push({type:1,index:r,name:f[2],strings:d,ctor:f[1]==="."?Le:f[1]==="?"?Re:f[1]==="@"?De:U}),i.removeAttribute(l)}else l.startsWith(g)&&(o.push({type:6,index:r}),i.removeAttribute(l));if(Ae.test(i.tagName)){const l=i.textContent.split(g),u=l.length-1;if(u>0){i.textContent=O?O.emptyScript:"";for(let d=0;d<u;d++)i.append(l[d],H()),w.nextNode(),o.push({type:2,index:++r});i.append(l[u],H())}}}else if(i.nodeType===8)if(i.data===we)o.push({type:2,index:r});else{let l=-1;for(;(l=i.data.indexOf(g,l+1))!==-1;)o.push({type:7,index:r}),l+=g.length-1}r++}}static createElement(e,t){const s=A.createElement("template");return s.innerHTML=e,s}}function k(a,e,t=a,s){if(e===_)return e;let i=s!==void 0?t._$Co?.[s]:t._$Cl;const r=F(e)?void 0:e._$litDirective$;return i?.constructor!==r&&(i?._$AO?.(!1),r===void 0?i=void 0:(i=new r(a),i._$AT(a,t,s)),s!==void 0?(t._$Co??=[])[s]=i:t._$Cl=i),i!==void 0&&(e=k(a,i._$AS(a,e.values),i,s)),e}class Ue{constructor(e,t){this._$AV=[],this._$AN=void 0,this._$AD=e,this._$AM=t}get parentNode(){return this._$AM.parentNode}get _$AU(){return this._$AM._$AU}u(e){const{el:{content:t},parts:s}=this._$AD,i=(e?.creationScope??A).importNode(t,!0);w.currentNode=i;let r=w.nextNode(),n=0,c=0,o=s[0];for(;o!==void 0;){if(n===o.index){let p;o.type===2?p=new C(r,r.nextSibling,this,e):o.type===1?p=new o.ctor(r,o.name,o.strings,this,e):o.type===6&&(p=new ze(r,this,e)),this._$AV.push(p),o=s[++c]}n!==o?.index&&(r=w.nextNode(),n++)}return w.currentNode=A,i}p(e){let t=0;for(const s of this._$AV)s!==void 0&&(s.strings!==void 0?(s._$AI(e,s,t),t+=s.strings.length-2):s._$AI(e[t])),t++}}class C{get _$AU(){return this._$AM?._$AU??this._$Cv}constructor(e,t,s,i){this.type=2,this._$AH=m,this._$AN=void 0,this._$AA=e,this._$AB=t,this._$AM=s,this.options=i,this._$Cv=i?.isConnected??!0}get parentNode(){let e=this._$AA.parentNode;const t=this._$AM;return t!==void 0&&e?.nodeType===11&&(e=t.parentNode),e}get startNode(){return this._$AA}get endNode(){return this._$AB}_$AI(e,t=this){e=k(this,e,t),F(e)?e===m||e==null||e===""?(this._$AH!==m&&this._$AR(),this._$AH=m):e!==this._$AH&&e!==_&&this._(e):e._$litType$!==void 0?this.$(e):e.nodeType!==void 0?this.T(e):Ne(e)?this.k(e):this._(e)}O(e){return this._$AA.parentNode.insertBefore(e,this._$AB)}T(e){this._$AH!==e&&(this._$AR(),this._$AH=this.O(e))}_(e){this._$AH!==m&&F(this._$AH)?this._$AA.nextSibling.data=e:this.T(A.createTextNode(e)),this._$AH=e}$(e){const{values:t,_$litType$:s}=e,i=typeof s=="number"?this._$AC(e):(s.el===void 0&&(s.el=I.createElement(_e(s.h,s.h[0]),this.options)),s);if(this._$AH?._$AD===i)this._$AH.p(t);else{const r=new Ue(i,this),n=r.u(this.options);r.p(t),this.T(n),this._$AH=r}}_$AC(e){let t=le.get(e.strings);return t===void 0&&le.set(e.strings,t=new I(e)),t}k(e){G(this._$AH)||(this._$AH=[],this._$AR());const t=this._$AH;let s,i=0;for(const r of e)i===t.length?t.push(s=new C(this.O(H()),this.O(H()),this,this.options)):s=t[i],s._$AI(r),i++;i<t.length&&(this._$AR(s&&s._$AB.nextSibling,i),t.length=i)}_$AR(e=this._$AA.nextSibling,t){for(this._$AP?.(!1,!0,t);e!==this._$AB;){const s=se(e).nextSibling;se(e).remove(),e=s}}setConnected(e){this._$AM===void 0&&(this._$Cv=e,this._$AP?.(e))}}class U{get tagName(){return this.element.tagName}get _$AU(){return this._$AM._$AU}constructor(e,t,s,i,r){this.type=1,this._$AH=m,this._$AN=void 0,this.element=e,this.name=t,this._$AM=i,this.options=r,s.length>2||s[0]!==""||s[1]!==""?(this._$AH=Array(s.length-1).fill(new String),this.strings=s):this._$AH=m}_$AI(e,t=this,s,i){const r=this.strings;let n=!1;if(r===void 0)e=k(this,e,t,0),n=!F(e)||e!==this._$AH&&e!==_,n&&(this._$AH=e);else{const c=e;let o,p;for(e=r[0],o=0;o<r.length-1;o++)p=k(this,c[s+o],t,o),p===_&&(p=this._$AH[o]),n||=!F(p)||p!==this._$AH[o],p===m?e=m:e!==m&&(e+=(p??"")+r[o+1]),this._$AH[o]=p}n&&!i&&this.j(e)}j(e){e===m?this.element.removeAttribute(this.name):this.element.setAttribute(this.name,e??"")}}class Le extends U{constructor(){super(...arguments),this.type=3}j(e){this.element[this.name]=e===m?void 0:e}}class Re extends U{constructor(){super(...arguments),this.type=4}j(e){this.element.toggleAttribute(this.name,!!e&&e!==m)}}class De extends U{constructor(e,t,s,i,r){super(e,t,s,i,r),this.type=5}_$AI(e,t=this){if((e=k(this,e,t,0)??m)===_)return;const s=this._$AH,i=e===m&&s!==m||e.capture!==s.capture||e.once!==s.once||e.passive!==s.passive,r=e!==m&&(s===m||i);i&&this.element.removeEventListener(this.name,this,s),r&&this.element.addEventListener(this.name,this,e),this._$AH=e}handleEvent(e){typeof this._$AH=="function"?this._$AH.call(this.options?.host??this.element,e):this._$AH.handleEvent(e)}}class ze{constructor(e,t,s){this.element=e,this.type=6,this._$AN=void 0,this._$AM=t,this.options=s}get _$AU(){return this._$AM._$AU}_$AI(e){k(this,e)}}const qe={I:C},We=Y.litHtmlPolyfillSupport;We?.(I,C),(Y.litHtmlVersions??=[]).push("3.3.3");const Ve=(a,e,t)=>{const s=t?.renderBefore??e;let i=s._$litPart$;if(i===void 0){const r=t?.renderBefore??null;s._$litPart$=i=new C(e.insertBefore(H(),r),r,void 0,t??{})}return i._$AI(a),i};const J=globalThis;let M=class extends E{constructor(){super(...arguments),this.renderOptions={host:this},this._$Do=void 0}createRenderRoot(){const e=super.createRenderRoot();return this.renderOptions.renderBefore??=e.firstChild,e}update(e){const t=this.render();this.hasUpdated||(this.renderOptions.isConnected=this.isConnected),super.update(e),this._$Do=Ve(t,this.renderRoot,this.renderOptions)}connectedCallback(){super.connectedCallback(),this._$Do?.setConnected(!0)}disconnectedCallback(){super.disconnectedCallback(),this._$Do?.setConnected(!1)}render(){return _}};M._$litElement$=!0,M.finalized=!0,J.litElementHydrateSupport?.({LitElement:M});const Ke=J.litElementPolyfillSupport;Ke?.({LitElement:M});(J.litElementVersions??=[]).push("4.2.2");const Ye={CHILD:2},Ge=a=>(...e)=>({_$litDirective$:a,values:e});let Je=class{constructor(e){}get _$AU(){return this._$AM._$AU}_$AT(e,t,s){this._$Ct=e,this._$AM=t,this._$Ci=s}_$AS(e,t){return this.update(e,t)}update(e,t){return this.render(...t)}};const{I:Ze}=qe,ce=a=>a,de=()=>document.createComment(""),T=(a,e,t)=>{const s=a._$AA.parentNode,i=e===void 0?a._$AB:e._$AA;if(t===void 0){const r=s.insertBefore(de(),i),n=s.insertBefore(de(),i);t=new Ze(r,n,a,a.options)}else{const r=t._$AB.nextSibling,n=t._$AM,c=n!==a;if(c){let o;t._$AQ?.(a),t._$AM=a,t._$AP!==void 0&&(o=a._$AU)!==n._$AU&&t._$AP(o)}if(r!==i||c){let o=t._$AA;for(;o!==r;){const p=ce(o).nextSibling;ce(s).insertBefore(o,i),o=p}}}return t},b=(a,e,t=a)=>(a._$AI(e,t),a),Qe={},Xe=(a,e=Qe)=>a._$AH=e,et=a=>a._$AH,z=a=>{a._$AR(),a._$AA.remove()};const he=(a,e,t)=>{const s=new Map;for(let i=e;i<=t;i++)s.set(a[i],i);return s},S=Ge(class extends Je{constructor(a){if(super(a),a.type!==Ye.CHILD)throw Error("repeat() can only be used in text expressions")}dt(a,e,t){let s;t===void 0?t=e:e!==void 0&&(s=e);const i=[],r=[];let n=0;for(const c of a)i[n]=s?s(c,n):n,r[n]=t(c,n),n++;return{values:r,keys:i}}render(a,e,t){return this.dt(a,e,t).values}update(a,[e,t,s]){const i=et(a),{values:r,keys:n}=this.dt(e,t,s);if(!Array.isArray(i))return this.ut=n,r;const c=this.ut??=[],o=[];let p,v,l=0,u=i.length-1,d=0,f=r.length-1;for(;l<=u&&d<=f;)if(i[l]===null)l++;else if(i[u]===null)u--;else if(c[l]===n[d])o[d]=b(i[l],r[d]),l++,d++;else if(c[u]===n[f])o[f]=b(i[u],r[f]),u--,f--;else if(c[l]===n[f])o[f]=b(i[l],r[f]),T(a,o[f+1],i[l]),l++,f--;else if(c[u]===n[d])o[d]=b(i[u],r[d]),T(a,i[l],i[u]),u--,d++;else if(p===void 0&&(p=he(n,d,f),v=he(c,l,u)),p.has(c[l]))if(p.has(c[u])){const $=v.get(n[d]),R=$!==void 0?i[$]:null;if(R===null){const Z=T(a,i[l]);b(Z,r[d]),o[d]=Z}else o[d]=b(R,r[d]),T(a,i[l],R),i[$]=null;d++}else z(i[u]),u--;else z(i[l]),l++;for(;d<=f;){const $=T(a,o[f+1]);b($,r[d]),o[d++]=$}for(;l<=u;){const $=i[l++];$!==null&&z($)}return this.ut=n,Xe(a,o),_}}),tt={overview:"Overview",projects:"Projects",records:"Records",activity:"Activity",teams:"Manage teams"},st=[{id:"atlas",name:"Atlas mobile app",description:"A focused mobile experience for field teams.",status:"Active",progress:72,due:"Due in 6 days",accent:"#6c5ce7",members:"AL · NB · FF"},{id:"meridian",name:"Meridian launch",description:"Go-to-market planning for the autumn release.",status:"Planning",progress:34,due:"Due in 3 weeks",accent:"#ef8354",members:"ES · EN · +4"},{id:"luminate",name:"Luminate design system",description:"Shared foundations for product and marketing.",status:"Active",progress:88,due:"Due tomorrow",accent:"#2a9d8f",members:"SB · BP · FK"},{id:"signal",name:"Signal research",description:"Customer interviews and opportunity mapping.",status:"Planning",progress:18,due:"Due next month",accent:"#3a86ff",members:"JB · TY · AC"}],it=[{id:"activity-1",initials:"NB",tone:"#e8e4ff",person:"Norm Barlug",action:"reviewed",target:"Multi-region wheat trial results",time:"6 minutes ago",personId:"norm-barlug"},{id:"activity-2",initials:"JB",tone:"#fff0d9",person:"Jaggi Boss",action:"calibrated",target:"Microwave semiconductor detector",time:"18 minutes ago",personId:"jaggi-boss"},{id:"activity-3",initials:"FF",tone:"#ffe8de",person:"Freddy Fraggin",action:"taped out",target:"Next-generation microprocessor",time:"31 minutes ago",personId:"freddy-fraggin"},{id:"activity-4",initials:"FK",tone:"#e8f1ff",person:"Fazlo Kan",action:"optimized",target:"Tubular high-rise load model",time:"54 minutes ago",personId:"fazlo-kan"},{id:"activity-5",initials:"EN",tone:"#dff5f1",person:"Emmy Nother",action:"proved",target:"Symmetry conservation framework",time:"1 hour ago",personId:"emmy-nother"},{id:"activity-6",initials:"ES",tone:"#deedff",person:"Erato Stenes",action:"mapped",target:"Planet-scale geodesy model",time:"2 hours ago",personId:"erato-stenes"},{id:"activity-7",initials:"TY",tone:"#f1ecdd",person:"Tutu Yoyo",action:"validated",target:"Plant-derived malaria program",time:"Yesterday at 16:42",personId:"tutu-yoyo"},{id:"activity-8",initials:"AC",tone:"#eee8fa",person:"Alfredo Church",action:"reduced",target:"Lambda computation model",time:"Yesterday at 14:10",personId:"alfredo-church"},{id:"activity-9",initials:"SB",tone:"#f1e8ff",person:"Steff Banak",action:"structured",target:"Functional analysis workspace",time:"Monday at 11:24",personId:"steff-banak"},{id:"activity-10",initials:"BP",tone:"#e4f2e8",person:"Blaze Paskal",action:"prototyped",target:"Mechanical calculation engine",time:"Monday at 09:15",personId:"blaze-paskal"},{id:"activity-11",initials:"AL",tone:"#f5e6f0",person:"Aida Loveleys",action:"programmed",target:"Machine-readable operating plan",time:"Friday at 15:40",personId:"aida-loveleys"}],at=[{id:"aida-loveleys",initials:"AL",tone:"#f5e6f0",name:"Aida Loveleys",role:"Principal Algorithm Architect",email:"aida@luminate.example",country:"United Kingdom",team:"Platform",bio:"Aida writes implementation plans for machines IT insists have not been ordered yet. Her technical specs mix logic with imagination, and somehow the engineering roadmap is always several generations behind her."},{id:"norm-barlug",initials:"NB",tone:"#e8e4ff",name:"Norm Barlug",role:"Chief Food Security Officer",email:"norm@luminate.example",country:"United States",team:"Agriculture",bio:"Norm is rarely at headquarters because he is usually walking a pilot field with the agriculture team. He measures quarterly performance in grain yield, treats hunger as the only unacceptable backlog, and credits every successful release to the people working beside him."},{id:"freddy-fraggin",initials:"FF",tone:"#ffe8de",name:"Freddy Fraggin",role:"Chief Silicon Architect",email:"freddy@luminate.example",country:"Italy",team:"Compute",bio:"Freddy keeps asking Hardware whether the entire quarterly roadmap can fit on one chip. By Friday he has redesigned the silicon process, taped out the processor, and started a new company because the existing org chart was slowing him down."},{id:"erato-stenes",initials:"ES",tone:"#dff5f1",name:"Erato Stenes",role:"Director of Geospatial Science",email:"erato@luminate.example",country:"Greece",team:"Earth Systems",bio:"Erato spends lunch measuring the office flagpole’s shadow, then returns with a surprisingly accurate estimate of the planet’s size. He runs Geospatial with geometry, travel receipts, and absolutely no satellite budget."},{id:"tutu-yoyo",initials:"TY",tone:"#deedff",name:"Tutu Yoyo",role:"Head of Translational Medicine",email:"tutu@luminate.example",country:"China",team:"Global Health",bio:"Tutu reads the oldest research archive in the company before approving a new experiment. She quietly turns one overlooked plant note into the strongest program in the clinical pipeline, then redirects the launch budget toward the regions that need it most."},{id:"emmy-nother",initials:"EN",tone:"#f1e8ff",name:"Emmy Nother",role:"Chief Mathematical Systems Officer",email:"emmy@luminate.example",country:"Germany",team:"Theoretical Systems",bio:"Emmy joins architecture reviews whenever the equations refuse to balance. She replaces a month of patches with one symmetry principle, leaves three new algebra frameworks on the whiteboard, and still has to remind Payroll that the work was hers."},{id:"steff-banak",initials:"SB",tone:"#e4f2e8",name:"Steff Banak",role:"VP of Mathematical Foundations",email:"steff@luminate.example",country:"Poland",team:"Analysis",bio:"Steff has converted half the office whiteboards into Banak spaces and insists every vague requirement needs a proper norm. Optimization teams keep borrowing his frameworks, although nobody is entirely sure when he finds time to write them."},{id:"blaze-paskal",initials:"BP",tone:"#fff0d9",name:"Blaze Paskal",role:"Director of Computational Tools",email:"blaze@luminate.example",country:"France",team:"Applied Mathematics",bio:"Blaze built Finance a mechanical spreadsheet because repeated arithmetic looked inefficient. Between probability forecasts and fluid-system reviews, he keeps launching small internal tools that accidentally become entire fields of study."},{id:"jaggi-boss",initials:"JB",tone:"#e8f1ff",name:"Jaggi Boss",role:"Head of Experimental Physics",email:"jaggi@luminate.example",country:"India",team:"Radio Science",bio:"Jaggi refuses to wait six weeks for Procurement, so he builds his own instruments and makes them more sensitive than the catalog models. His calendar alternates between wireless demos and plant-response experiments because he sees no reason for departments to limit the evidence."},{id:"fazlo-kan",initials:"FK",tone:"#f6e7db",name:"Fazlo Kan",role:"Chief Structural Systems Engineer",email:"fazlo@luminate.example",country:"Bangladesh",team:"Built Environment",bio:"Fazlo enters every Facilities review, redraws the building as a structural tube, and removes a worrying amount of unnecessary material from the estimate. The result is taller, safer, cheaper, and usually sketched before everyone else has opened the slide deck."},{id:"alfredo-church",initials:"AC",tone:"#eee8fa",name:"Alfredo Church",role:"Director of Functional Systems",email:"alfredo@luminate.example",country:"United States",team:"Logic & Computation",bio:"Alfredo turns every software meeting into functions calling other functions and refuses to approve hidden state. His tiny lambda diagrams somehow explain the whole compute platform, and the functional-programming team treats his 1930s-style notes as current documentation."}],rt=[{id:"active-projects",label:"Active projects",value:"8",change:"+2 this month",direction:"positive"},{id:"tasks-completed",label:"Tasks completed",value:"184",change:"+12.4% from last month",direction:"positive"},{id:"team-focus",label:"Team focus",value:"86%",change:"On track",direction:"positive"},{id:"review-queue",label:"Review queue",value:"5",change:"2 due today",direction:"neutral"}],nt={routeLabels:tt,projects:st,activities:it,members:at,metrics:rt},{routeLabels:ot,projects:q,activities:W,members:N,metrics:lt}=nt,ct=new Intl.DateTimeFormat("en-US",{weekday:"long",month:"long",day:"numeric"}),dt=new Intl.DateTimeFormat("en-US",{weekday:"short"});function ht(a=new Date){const e=a.getHours();return{title:`Good ${e<12?"morning":e<18?"afternoon":"evening"}, Freddy`,date:ct.format(a),today:dt.format(a)}}function pe(a){const e=a.replace(/^#\//,"").split(/[/?]/)[0];return e==="projects"||e==="records"||e==="activity"||e==="teams"?e:"overview"}function ue(a){return/^#\/teams\/([a-z0-9-]+)(?:[/?]|$)/.exec(a)?.[1]??null}function pt(){/^#\/(overview|projects|records|activity|teams)(?:[/?]|$)/.test(location.hash)||history.replaceState(null,"","#/overview")}function ut(a,e){return`${N.find(s=>s.id===e)?.name??ot[a]} · Luminate`}const mt=["all","alpha","beta","gamma","delta"],vt=["alpha","beta","gamma","delta"],ft=["Aida Loveleys","Norm Barlug","Freddy Fraggin","Emmy Nother","Fazlo Kan"],$t=2e4,L={recordFilters:mt,groups:vt,owners:ft,recordCount:$t},gt=L.recordFilters,me=L.groups,ve=L.owners,fe=Array.from({length:L.recordCount},(a,e)=>{const t=e+1,s=`record-${String(t).padStart(5,"0")}`,i=me[e%me.length]??"alpha",r=ve[e%ve.length]??"Aida Loveleys",n=t*97%1e4;return{id:s,name:`Workspace record ${String(t).padStart(5,"0")}`,group:i,owner:r,value:n,label:`${s} · ${i} · ${r} · ${n}`}});function yt(a){return a==="all"?fe:fe.filter(e=>e.group===a)}function bt(a,e){return e==="ascending"?a:Array.from(a).reverse()}const wt=["all","active","planning"],$e=["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];class At extends M{static properties={route:{state:!0},memberId:{state:!0},navOpen:{state:!0},projectFilter:{state:!0},recordFilter:{state:!0},recordSort:{state:!0},toasts:{state:!0},emailError:{state:!0},now:{state:!0}};nextToastId=1;clock;toastTimers=new Map;constructor(){super(),pt(),this.route=pe(location.hash),this.memberId=ue(location.hash),this.navOpen=!1,this.projectFilter="all",this.recordFilter="all",this.recordSort="ascending",this.toasts=[],this.emailError="",this.now=new Date}createRenderRoot(){return this}connectedCallback(){super.connectedCallback(),addEventListener("hashchange",this.handleHashChange),this.clock=window.setInterval(()=>{this.now=new Date},6e4)}disconnectedCallback(){removeEventListener("hashchange",this.handleHashChange),window.clearInterval(this.clock),this.clearToastTimers(),super.disconnectedCallback()}updated(){document.title=ut(this.route,this.memberId)}handleHashChange=()=>{this.route=pe(location.hash),this.memberId=ue(location.hash),this.navOpen=!1,this.toasts=[],this.clearToastTimers(),this.updateComplete.then(()=>{this.querySelector("main")?.focus({preventScroll:!0})})};closeIfCurrent(e){this.route===e&&(this.navOpen=!1)}clearToastTimers(){this.toastTimers.forEach(e=>clearTimeout(e)),this.toastTimers.clear()}validationMessage(e){return e.validity.valueMissing?"Enter an email address.":e.validity.typeMismatch?"Enter a valid email address.":""}submitInvite(e){e.preventDefault();const s=e.currentTarget.elements.namedItem("email");if(s.value=s.value.trim(),this.emailError=this.validationMessage(s),this.emailError!==""){s.focus();return}this.showToast()}submitDemo(e){e.preventDefault(),this.showToast()}updateEmailError(e){this.emailError!==""&&(this.emailError=this.validationMessage(e.currentTarget))}showToast(){const e={id:`toast-${this.nextToastId++}`,message:"No server for demo"};this.toasts=[...this.toasts,e],this.toastTimers.set(e.id,window.setTimeout(()=>this.dismissToast(e.id),3200))}dismissToast(e){clearTimeout(this.toastTimers.get(e)),this.toastTimers.delete(e),this.toasts=this.toasts.filter(t=>t.id!==e)}render(){return h`
      <div id="shell" data-navigation-state=${this.navOpen?"open":m}>
        <div id="header">${this.renderHeader()}</div>
        <aside id="sidebar">${this.renderNavigation()}</aside>
        <button
          id="backdrop"
          type="button"
          aria-label="Close navigation"
          @click=${()=>{this.navOpen=!1}}
        ></button>
        <main tabindex="-1">${this.renderPage()}</main>
      </div>
    `}renderHeader(){return h`
      <header id="topbar">
        <div class="start">
          <button
            id="menu"
            class="icon-button"
            type="button"
            aria-label="Open navigation"
            aria-controls="navigation"
            aria-expanded=${this.navOpen}
            @click=${()=>{this.navOpen=!this.navOpen}}
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
    `}renderNavigation(){const e=t=>this.route===t?"page":m;return h`
      <nav id="navigation" aria-label="Primary navigation">
        <div class="body">
          <p class="eyebrow">Workspace</p>
          <a class="link" href="#/overview" aria-current=${e("overview")} @click=${()=>this.closeIfCurrent("overview")}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="6" height="6" rx="1"></rect><rect x="14" y="4" width="6" height="6" rx="1"></rect><rect x="4" y="14" width="6" height="6" rx="1"></rect><rect x="14" y="14" width="6" height="6" rx="1"></rect></svg>
            <span>Overview</span>
          </a>
          <a class="link" href="#/projects" aria-current=${e("projects")} @click=${()=>this.closeIfCurrent("projects")}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7.5h6l2-2h8v14H4v-12Z"></path></svg>
            <span>Projects</span><span class="count">${q.length}</span>
          </a>
          <a class="link" href="#/records" aria-current=${e("records")} @click=${()=>this.closeIfCurrent("records")}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h14M5 12h14M5 19h14"></path></svg>
            <span>Records</span>
          </a>
          <a class="link" href="#/activity" aria-current=${e("activity")} @click=${()=>this.closeIfCurrent("activity")}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h3l2-6 4 12 2-6h5"></path></svg>
            <span>Activity</span>
          </a>
          <p class="eyebrow manage">Manage</p>
          <a class="link" href="#/teams" aria-current=${e("teams")} @click=${()=>this.closeIfCurrent("teams")}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3"></circle><path d="M3.5 19c.5-4 2.3-6 5.5-6s5 2 5.5 6M16 8h5M18.5 5.5v5"></path></svg>
            <span>Teams</span>
          </a>
        </div>
      </nav>
    `}renderPage(){switch(this.route){case"projects":return this.renderProjects();case"records":return this.renderRecords();case"activity":return this.renderActivity();case"teams":return this.renderTeams();default:return this.renderOverview()}}renderOverview(){const e=ht(this.now);return h`
      <section id="overview" aria-labelledby="overview-title">
        <div class="heading">
          <div><p class="eyebrow">${e.date}</p><h1 id="overview-title">${e.title}</h1><p>Here's what's happening across your workspace today.</p></div>
          <a class="primary-button" href="#/projects"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7.5h6l2-2h8v14H4v-12Z"></path></svg>View projects</a>
        </div>
        <div class="metric-grid">
          ${S(lt,t=>t.id,t=>h`
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
          ${this.renderProjectCards(q.slice(0,3))}
        </section>
        <div class="overview-lower">
          <section class="panel activity-panel" aria-labelledby="recent-activity-title">
            <div class="heading">
              <div><h2 id="recent-activity-title">Recent activity</h2><p>The latest updates from your team.</p></div>
              <a class="text-link" href="#/activity">See all</a>
            </div>
            ${this.renderActivityList(W.slice(0,3))}
          </section>
          <aside class="panel week-card" aria-labelledby="week-title">
            <div class="top"><p class="eyebrow">This week</p><h2 id="week-title">Strong momentum</h2><p>Your team completed 28% more work than last week.</p></div>
            <div class="week-chart" aria-label="Weekly activity chart">
              ${$e.map(t=>h`<span data-day-state=${t===e.today?"today":m}><i>${t}</i></span>`)}
            </div>
          </aside>
        </div>
      </section>
    `}renderProjects(){const e=q.filter(t=>this.projectFilter==="all"||t.status.toLowerCase()===this.projectFilter);return h`
      <section id="projects" aria-labelledby="projects-title">
        <div class="heading"><div><p class="eyebrow">Workspace</p><h1 id="projects-title">Projects</h1><p>Plan work, track progress, and keep the team aligned.</p></div></div>
        <div class="project-toolbar">
          <div class="filters" aria-label="Filter projects">
            ${wt.map(t=>h`
              <button
                type="button"
                aria-pressed=${this.projectFilter===t}
                @click=${()=>{this.projectFilter=t}}
              >${t[0].toUpperCase()+t.slice(1)}</button>
            `)}
          </div>
          <p>${e.length} ${e.length===1?"project":"projects"} shown</p>
        </div>
        ${this.renderProjectCards(e)}
      </section>
    `}renderRecords(){const e=bt(yt(this.recordFilter),this.recordSort);return h`
      <section id="records" aria-labelledby="records-title">
        <div class="heading"><div><p class="eyebrow">Performance dataset</p><h1 id="records-title">Records</h1><p>Filter and sort a deterministic 20,000-row dataset without virtualization.</p></div></div>
        <div class="record-toolbar">
          <div class="filters" aria-label="Filter records">
            ${gt.map(t=>h`
              <button
                type="button"
                data-record-filter=${t}
                aria-pressed=${this.recordFilter===t}
                @click=${()=>{this.recordFilter=t}}
              >${t[0].toUpperCase()+t.slice(1)}</button>
            `)}
          </div>
          <p class="record-summary">${e.length.toLocaleString("en-US")} records shown</p>
        </div>
        <div class="record-list-wrap panel">
          <div class="record-list-header" aria-sort=${this.recordSort}>
            <button
              type="button"
              data-record-sort
              @click=${()=>{this.recordSort=this.recordSort==="ascending"?"descending":"ascending"}}
            >
              Record <span class="record-sort-indicator" aria-hidden="true">${this.recordSort==="ascending"?"↑":"↓"}</span>
            </button>
          </div>
          <ol class="record-list">
            ${S(e,t=>t.id,t=>h`
              <li class="record-row">${t.label}</li>
            `)}
          </ol>
        </div>
      </section>
    `}renderActivity(){return h`
      <section id="activity" aria-labelledby="activity-title">
        <div class="heading">
          <div><p class="eyebrow">Workspace</p><h1 id="activity-title">Team activity</h1><p>A shared record of progress across every project.</p></div>
          <span class="count">${W.length} updates</span>
        </div>
        <div class="activity-layout">
          <section class="panel activity-panel" aria-label="All activity">
            <div class="activity-date"><span>Today</span><span class="line"></span></div>
            ${this.renderActivityList(W)}
          </section>
          <aside class="activity-summary">
            <section class="panel summary-card">
              <p class="eyebrow">Last 7 days</p><strong>42</strong><span>team updates</span>
              <div class="mini-bars" aria-hidden="true">${$e.map(()=>h`<i></i>`)}</div>
            </section>
            <section class="panel contributor-card">
              <p class="eyebrow">Top contributors</p>
              ${this.renderContributor("norm-barlug","Norm Barlug","14")}
              ${this.renderContributor("emmy-nother","Emmy Nother","11")}
              ${this.renderContributor("fazlo-kan","Fazlo Kan","9")}
            </section>
          </aside>
        </div>
      </section>
    `}renderTeams(){const e=N.find(t=>t.id===this.memberId);return h`
      <section id="teams">
        ${e?this.renderMemberProfile(e):this.renderDirectory()}
        <div id="toasts" aria-live="polite" aria-label="Notifications">
          ${S(this.toasts,t=>t.id,t=>h`
            <div class="toast">
              <span class="icon" aria-hidden="true">!</span>
              <span class="message">${t.message}</span>
              <button type="button" aria-label="Dismiss notification" @click=${()=>this.dismissToast(t.id)}>×</button>
            </div>
          `)}
        </div>
      </section>
    `}renderDirectory(){return h`
      <div>
        <div class="heading">
          <div><p class="eyebrow">Manage</p><h1 id="teams-title">Manage teams</h1><p>Invite people and organize how your workspace collaborates.</p></div>
          <span class="count">${N.length} members</span>
        </div>
        <section class="panel member-directory" aria-labelledby="member-list-title">
          <div class="heading"><div><h2 id="member-list-title">All team members</h2><p>Everyone with access to the Luminate workspace.</p></div><span>Team</span><span>Role</span></div>
          <div class="member-list">
            ${S(N,e=>e.id,e=>h`
              <article class="member-row">
                <span class="avatar" data-person=${e.id}>${e.initials}</span>
                <div class="identity"><a href="#/teams/${e.id}">${e.name}</a><span>${e.email}</span></div>
                <span class="team">${e.team}</span><span class="role">${e.role}</span>
              </article>
            `)}
          </div>
        </section>
        <section class="team-actions">
          <div class="heading"><div><h2>Team actions</h2><p>Invitations and new teams require a connected server.</p></div></div>
          <div class="forms">
            <form class="panel team-form" novalidate @submit=${this.submitInvite}>
              ${this.renderFormHeading(h`<circle cx="9" cy="8" r="3"></circle><path d="M3.5 19c.5-4 2.3-6 5.5-6s5 2 5.5 6M17.5 8v6M14.5 11h6"></path>`,"Invite a teammate","Send an invitation to join Luminate.")}
              <label class="field">
                <span>Email address</span>
                <input
                  type="email"
                  name="email"
                  placeholder="name@company.com"
                  aria-describedby="invite-email-error"
                  aria-invalid=${this.emailError?"true":m}
                  required
                  @input=${this.updateEmailError}
                >
                <small id="invite-email-error" class="error" aria-live="polite" ?hidden=${!this.emailError}>${this.emailError}</small>
              </label>
              <label class="field"><span>Role</span><select name="role"><option>Member</option><option>Admin</option><option>Viewer</option></select></label>
              <button class="primary-button" type="submit">Send invitation</button>
            </form>
            <form class="panel team-form" novalidate @submit=${this.submitDemo}>
              ${this.renderFormHeading(h`<circle cx="8" cy="8" r="3"></circle><circle cx="17" cy="9" r="2.5"></circle><path d="M2.5 19c.5-4 2.3-6 5.5-6s5 2 5.5 6M14 14c3.8-.7 6.2 1 6.8 5"></path>`,"Create a team","Group teammates around a shared area of work.","create-team")}
              <label class="field"><span>Team name</span><input type="text" name="teamName" placeholder="e.g. Product design" required></label>
              <label class="field"><span>Description <em>Optional</em></span><textarea name="description" rows="3" placeholder="What does this team work on?"></textarea></label>
              <button class="primary-button" type="submit">Create team</button>
            </form>
          </div>
        </section>
      </div>
    `}renderMemberProfile(e){return h`
      <div id="profile">
        <a class="back-link" href="#/teams"><span aria-hidden="true">←</span> All team members</a>
        <article class="panel member-profile-card">
          <div class="header">
            <span class="avatar large" data-person=${e.id}>${e.initials}</span>
            <div><p class="eyebrow">${e.team}</p><h1>${e.name}</h1><span>${e.role}</span></div>
          </div>
          <p class="bio">${e.bio}</p>
          <dl class="member-details">
            <div><dt>Email</dt><dd><a href="mailto:${e.email}">${e.email}</a></dd></div>
            <div><dt>Country</dt><dd>${e.country}</dd></div>
            <div><dt>Team</dt><dd>${e.team}</dd></div>
          </dl>
        </article>
      </div>
    `}renderProjectCards(e){return h`
      <div class="project-grid">
        ${S(e,t=>t.id,t=>h`
          <article class="project-card">
            <div class="top"><span class="accent" data-project=${t.id}></span><span class="status" data-status=${t.status}>${t.status}</span></div>
            <h3>${t.name}</h3><p>${t.description}</p>
            <div class="progress-label"><span>Progress</span><strong>${t.progress}%</strong></div>
            <div class="progress-track"><span class="bar" data-project=${t.id}></span></div>
            <div class="footer"><span class="members">${t.members}</span><span>${t.due}</span></div>
          </article>
        `)}
      </div>
    `}renderActivityList(e){return h`
      <ol class="activity-list">
        ${S(e,t=>t.id,t=>h`
          <li class="activity-item">
            <span class="avatar" data-person=${t.personId}>${t.initials}</span>
            <div class="copy">
              <p><a class="person" href="#/teams/${t.personId}">${t.person}</a> <span>${t.action}</span> <b>${t.target}</b></p>
              <time>${t.time}</time>
            </div>
          </li>
        `)}
      </ol>
    `}renderContributor(e,t,s){const i=t.split(" ").map(r=>r[0]).join("");return h`
      <div><span class="avatar" data-person=${e}>${i}</span><a href="#/teams/${e}">${t}</a><em>${s}</em></div>
    `}renderFormHeading(e,t,s,i){return h`
      <div class="heading">
        <span class="icon" data-form-kind=${i??m} aria-hidden="true"><svg viewBox="0 0 24 24">${e}</svg></span>
        <div><h2>${t}</h2><p>${s}</p></div>
      </div>
    `}}customElements.define("luminate-app",At);
