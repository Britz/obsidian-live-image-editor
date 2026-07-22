(()=>{var k="lie-img",h="lie-inline";var M={left:"float-left",right:"float-right","block-left":"block-left","block-center":"block-center","block-right":"block-right",center:"block-center"};var F={"lie-left":"float-left","lie-right":"float-right","lie-center":"block-center"};function et(e){var r,o;let t=[];if(!e)return t;let n=/([a-zA-Z][\w-]*)\(([^)]*)\)/g,i;for(;(i=n.exec(e))!==null;)t.push({name:(r=i[1])!=null?r:"",args:((o=i[2])!=null?o:"").trim()});return t}function C(e){var t;return(t=e.rotate)!=null?t:0}function v(e){return et(e.transform).some(t=>t.name==="translate"||t.name==="scale")}function g(e){return H(e.width)}function E(e){return H(e.height)}function H(e){var n;if(!e)return null;let t=e.trim().match(/^(\d+(?:\.\d+)?)px$/);return t?parseFloat((n=t[1])!=null?n:""):null}function D(e){return(Math.round(e/90)%4+4)%4}function I(e,t){if(!isFinite(e)||e<=0)return 1;let n=D(t);return n===1||n===3?1/e:e}function _(e,t){if(!isFinite(e)||e<=0)return{w:100,h:100};let n=D(t);return n===1||n===3?{w:e*100,h:1/e*100}:{w:100,h:100}}function m(e,t,n){let i=n*Math.PI/180;return{w:Math.abs(e*Math.cos(i))+Math.abs(t*Math.sin(i)),h:Math.abs(e*Math.sin(i))+Math.abs(t*Math.cos(i))}}function P(e,t,n){return Math.round(m(e,t,n).w)}function y(e){let{widthPx:t,heightPx:n,naturalRatio:i,deg:r}=e,o=i!=null&&isFinite(i)&&i>0;if(t!=null&&n!=null){let a=m(t,n,r);return{width:Math.round(a.w),height:Math.round(a.h)}}return t!=null?o?{width:Math.round(m(t,t/i,r).w)}:{width:Math.round(t)}:n!=null?o?{height:Math.round(m(n*i,n,r).h)}:{height:Math.round(n)}:{}}function nt(e){if(e.heightPx&&e.heightPx>0)return Math.round(e.heightPx);let t=e.aspectRatio&&e.aspectRatio>0?e.aspectRatio:1/.7;return e.widthPx&&e.widthPx>0?Math.round(e.widthPx/t):480}var it=250;function N(e){return nt(e)>it}var x="lie-image-area",L="lie-frame";function j(e,t){var c;lt(e);let n=ct(e),i=e.parentElement;t.layout==="inline"&&n.classList.add(h);let r=t.layout&&t.layout!=="inline"?`lie-${t.layout}`:null,a=(t.layout==="float-left"||t.layout==="float-right")&&N({widthPx:g(t),heightPx:E(t),aspectRatio:t.aspectRatio?R(t.aspectRatio):null});ut(n,[...t.classes,...r?[r]:[],...a?["lie-tall"]:[]],"lieClasses"),e.style.filter=(c=t.filter)!=null?c:"",rt(n,t),ot(i,t),at(e,n,i,t)}function rt(e,t){if(t.box)for(let[n,i]of Object.entries(t.box))e.style.setProperty(n,i);v(t)||(t.width&&(e.style.width=t.width),t.height&&(e.style.height=t.height),t.aspectRatio&&(e.style.aspectRatio=t.aspectRatio))}function ot(e,t){let n=["translate(-50%, -50%)"];t.rotate&&n.push(`rotate(${t.rotate}deg)`),t.flipH&&n.push("scaleX(-1)"),t.flipV&&n.push("scaleY(-1)"),e.style.transform=n.join(" ")}function at(e,t,n,i){var c,f,p;let r=C(i);if(v(i)){e.style.transform=(c=i.transform)!=null?c:"",e.classList.add("lie-crop-fit");let s=(f=st(i))!=null?f:1;z(t,n,s,r);let u=g(i);u?t.style.width=`${Math.round(m(u,u/s,r).w)}px`:i.width?t.style.width=i.width:O(e,(d,l)=>{t.style.width=`${P(d,l,r)}px`});return}e.style.transform=(p=i.transform)!=null?p:"",t.style.setProperty("--lie-auto-aspect",i.aspectRatio||"1");let o=g(i),a=E(i);if(o!=null&&a!=null){let s=y({widthPx:o,heightPx:a,naturalRatio:null,deg:r});s.width!=null&&(t.style.width=`${s.width}px`),s.height!=null&&(t.style.height=`${s.height}px`)}if(i.aspectRatio){let s=R(i.aspectRatio);if(s){let u=I(s,r);u!==s&&(t.style.aspectRatio=String(u))}}O(e,(s,u)=>{if(z(t,n,s/u,r),!i.width&&!i.height)t.style.width=`${P(s,u,r)}px`;else if(o!=null&&a==null){let d=y({widthPx:o,heightPx:null,naturalRatio:s/u,deg:r});d.width!=null&&(t.style.width=`${d.width}px`)}else if(a!=null&&o==null){let d=y({widthPx:null,heightPx:a,naturalRatio:s/u,deg:r});d.height!=null&&(t.style.height=`${d.height}px`)}})}function O(e,t){let n=()=>{let o=e.naturalWidth,a=e.naturalHeight;return!o||!a?!1:(t(o,a),!0)};if(n())return;e.addEventListener("load",()=>{n()},{once:!0});let i=0,r=()=>{n()||++i>20||!e.isConnected||window.setTimeout(r,50)};window.setTimeout(r,0)}function z(e,t,n,i){e.style.setProperty("--lie-auto-aspect",String(I(n,i)));let r=_(n,i);t.style.width=`${r.w}%`,t.style.height=`${r.h}%`}function st(e){let t=R(e.aspectRatio);if(t)return t;let n=g(e),i=E(e);return n&&i?n/i:null}function R(e){var r;if(!e)return null;let t=e.match(/^\s*([\d.]+)\s*(?:\/\s*([\d.]+))?\s*$/);if(!t)return null;let n=parseFloat((r=t[1])!=null?r:""),i=t[2]?parseFloat(t[2]):1;return n>0&&i>0?n/i:null}function lt(e){e.classList.remove(k,h),$(e,"lieMarkers"),$(e,"lieClasses"),e.style.removeProperty("transform"),e.style.removeProperty("filter"),e.classList.remove("lie-crop-fit");let t=e.parentElement;for(let n=0;n<2&&t&&(t.classList.contains(L)||t.classList.contains(x));n++)t.classList.contains(x)&&($(t,"lieClasses"),t.classList.remove(h)),t.removeAttribute("style"),t=t.parentElement}function ct(e){let t=e.parentElement;if(t&&t.classList.contains(L)){let r=t.parentElement;if(r&&r.classList.contains(x))return r}if(t&&t.classList.contains(x)){let r=activeDocument.createElement("span");return r.classList.add(L),t.insertBefore(r,e),r.appendChild(e),t}let n=activeDocument.createElement("span");n.classList.add(x);let i=activeDocument.createElement("span");return i.classList.add(L),t==null||t.insertBefore(n,e),n.appendChild(i),i.appendChild(e),n}function ut(e,t,n){let i=t.filter(Boolean);for(let r of i)e.classList.add(r);i.length?e.dataset[n]=i.join(" "):delete e.dataset[n]}function $(e,t){let n=e.dataset[t];if(n){for(let i of n.split(" "))i&&e.classList.remove(i);delete e.dataset[t]}}var B=`
.lie-image-area {
  display: inline-block;
  position: relative;
  overflow: hidden;
  max-width: 100%;
  aspect-ratio: var(--lie-auto-aspect, auto);
  line-height: 0;
  vertical-align: bottom;
}
.lie-frame {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 100%;
  height: 100%;
  overflow: hidden;
  transform-origin: center;
}
.lie-frame > img {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  margin: auto;
  width: 100%;
  height: 100%;
  transform-origin: center;
  max-width: none !important;
}
.lie-frame > img.lie-crop-fit { height: auto; }
.lie-image-area.lie-inline { vertical-align: middle; }
`,V=`
.lie-has-caption { display: inline-flex; flex-direction: column; align-items: stretch; }
.lie-caption {
  display: block;
  width: 0;
  min-width: 100%;
  box-sizing: border-box;
  margin-top: 4px;
  text-align: center;
  font-size: var(--font-smaller, 0.85em);
  color: var(--text-muted, #888);
  line-height: var(--line-height-tight, 1.3);
}
.lie-caption > :first-child { margin-top: 0; }
.lie-caption > :last-child { margin-bottom: 0; }
.lie-caption p { margin: 0; overflow-wrap: anywhere; }
.lie-caption img { max-width: 100%; }
.lie-has-caption.lie-float-left { float: left; clear: none; margin: 0 1em 0.5em 0; }
.lie-has-caption.lie-float-right { float: right; clear: none; margin: 0 0 0.5em 1em; }
.lie-has-caption.lie-block-left { display: flex; width: fit-content; margin-right: auto; }
.lie-has-caption.lie-block-center { display: flex; width: fit-content; margin-left: auto; margin-right: auto; }
.lie-has-caption.lie-block-right { display: flex; width: fit-content; margin-left: auto; }
`,S='[rotate],[flip],[transform],[aspect-ratio],[filter],.lie,.lie-inline,[align="center"],[align^="block-"],[data-align="center"],[data-align^="block-"],[data-rotate],[data-flip],[data-transform],[data-aspect-ratio],[data-filter]';function b(e,t){var n;return(n=e.getAttribute(t))!=null?n:e.getAttribute(`data-${t}`)}function W(e){var s,u,d;let t={classes:[]},n=b(e,"rotate");if(n!=null){let l=parseFloat(n);Number.isNaN(l)||(t.rotate=l)}let i=b(e,"flip");if(i)for(let l of i.split(/[\s,]+/).filter(Boolean))l==="horizontal"||l==="h"?t.flipH=!0:l==="vertical"||l==="v"?t.flipV=!0:l==="both"&&(t.flipH=!0,t.flipV=!0);let r=b(e,"transform");r&&(t.transform=r);let o=b(e,"filter");o&&(t.filter=o);let a=b(e,"aspect-ratio");a&&(t.aspectRatio=a);let c=(s=e.getAttribute("width"))!=null?s:e.getAttribute("data-width");c&&(t.width=/^\d+(?:\.\d+)?$/.test(c.trim())?`${c.trim()}px`:c.trim());let f=(u=e.getAttribute("height"))!=null?u:e.getAttribute("data-height");f&&(t.height=/^\d+(?:\.\d+)?$/.test(f.trim())?`${f.trim()}px`:f.trim());let p=(d=e.getAttribute("align"))!=null?d:e.getAttribute("data-align");if(p){let l=M[p];l&&(t.layout=l)}for(let l of Array.from(e.classList)){if(l==="lie"||l===k)continue;if(l===h){t.layout="inline";continue}let A=F[l];if(A){t.layout=A;continue}t.classes.push(l)}return t}var U="(?:\\d+|auto)",w=new RegExp(`^${U}(?:x${U})?$`);var K='"';function Y(e){let t=e.trim();if(t==="")return{caption:"",size:""};let n="",i=t.lastIndexOf("|");if(i>=0){let c=t.slice(i+1).trim();if(w.test(c)&&(n=c,t=t.slice(0,i).trim(),t===""))return{caption:"",size:n}}let r=t.indexOf(K),o=t.lastIndexOf(K);if(r>=0&&o>r){let c=t.slice(r+1,o),f=(t.slice(0,r)+" "+t.slice(o+1)).trim();return{caption:c,size:w.test(f)?f:n}}let a=t.split(/\s+/);return a.length>1&&w.test(a[0])?{caption:a.slice(1).join(" "),size:a[0]}:a.length>1&&w.test(a[a.length-1])?{caption:a.slice(0,-1).join(" "),size:a[a.length-1]}:w.test(t)?{caption:"",size:t}:{caption:t,size:n}}function q(e){return Y(e!=null?e:"").caption}function ft(e="div"){let t=activeDocument.createElement(e);return t.className="lie-caption",t.setAttribute("contenteditable","false"),t}var dt=["lie-float-left","lie-float-right","lie-block-left","lie-block-center","lie-block-right"];function G(e,t){let n=e.parentElement;if(!t||!n||n.classList.contains("lie-has-caption"))return null;let i=activeDocument.createElement("span");i.className="lie-has-caption";for(let o of dt)e.classList.contains(o)&&(e.classList.remove(o),i.classList.add(o));n.insertBefore(i,e),i.appendChild(e);let r=ft("span");return r.textContent=t,i.appendChild(r),r}function mt(e){return e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}function pt(e){let t=e.trim();return/^(https?:|mailto:|#|\/|\.\.?\/)/i.test(t)?t:"#"}function X(e){return mt(e).split(/(`[^`]+`)/).map((t,n)=>{if(n%2===1)return`<code>${t.slice(1,-1)}</code>`;let i=t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g,(r,o,a)=>`<a href="${pt(a)}" target="_blank" rel="noopener">${o}</a>`);return i=i.replace(/\*\*([^*]+)\*\*/g,"<strong>$1</strong>"),i=i.replace(/\*([^*]+)\*/g,"<em>$1</em>"),i}).join("")}var Q=`/* Live Image Editor \u2014 example image decoration classes.
   Installed from the plugin settings (opt-in). Edit freely; "Reset" in settings restores this
   shipped version. Apply a class in the image's trailing block, e.g. {shadow} or {rounded shadow}.
   The class lands on the image's OUTER box (which controls size + layout), so a plain ".name"
   styles the whole image \u2014 and box effects (shadow / border / rounding) are no longer clipped.
   Reach the pixels with ".name img" (e.g. object-fit). ".name" also matches a bare exported
   <img class="name">; "img.name" is the export fallback so object-fit reaches the image itself.
   Colours derive from the text colour so they adapt to light / dark themes. */
.rounded { border-radius: 8px; }
.shadow { box-shadow: 0 4px 14px color-mix(in srgb, var(--text-normal) 70%, transparent); }
.bordered { border: 2px solid var(--text-normal); box-sizing: border-box; }
.circle { border-radius: 50%; aspect-ratio: 1; }
.circle img, img.circle { object-fit: cover; }
`;var ht=`
.lie-image-area.lie-float-left { float: left; clear: none; margin: 0 1em 0.5em 0; }
.lie-image-area.lie-float-right { float: right; clear: none; margin: 0 0 0.5em 1em; }
.lie-image-area.lie-block-left { display: block; margin-right: auto; }
.lie-image-area.lie-block-center { display: block; margin-left: auto; margin-right: auto; }
.lie-image-area.lie-block-right { display: block; margin-left: auto; }
`,Z=new Set;function T(e,t){if(Z.has(e))return;Z.add(e);let n=new CSSStyleSheet;n.replaceSync(t),document.adoptedStyleSheets=[...document.adoptedStyleSheets,n]}function gt(e){let t=[];if(e instanceof HTMLImageElement&&e.matches(S)&&t.push(e),e instanceof Element||e instanceof Document)for(let n of Array.from(e.querySelectorAll(S)))n instanceof HTMLImageElement&&t.push(n);return t}function J(e){for(let t of gt(e))t.closest(".lie-frame")||(j(t,W(t)),bt(t))}function bt(e){var r,o;let t=e.closest(".lie-image-area");if(!t)return;let n=G(t,q((r=e.getAttribute("alt"))!=null?r:""));if(!n)return;let i=new DOMParser().parseFromString(X((o=n.textContent)!=null?o:""),"text/html");n.replaceChildren(...Array.from(i.body.childNodes))}function tt(){Object.assign(globalThis,{activeDocument:document,activeWindow:window}),T("lie-runtime-render-css",B),T("lie-runtime-css",ht),T("lie-runtime-caption-css",V),T("lie-runtime-snippet-css",Q),J(document),new MutationObserver(t=>{for(let n of t)for(let i of Array.from(n.addedNodes))J(i)}).observe(document.documentElement,{childList:!0,subtree:!0})}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",tt,{once:!0}):tt();})();
