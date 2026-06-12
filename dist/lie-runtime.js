(()=>{var T="lie-img",p="lie-inline";var M={left:"float-left",right:"float-right","block-left":"block-left","block-center":"block-center","block-right":"block-right",center:"block-center"};var P={"lie-left":"float-left","lie-right":"float-right","lie-center":"block-center"};function W(e){var r,s;let t=[];if(!e)return t;let n=/([a-zA-Z][\w-]*)\(([^)]*)\)/g,i;for(;(i=n.exec(e))!==null;)t.push({name:(r=i[1])!=null?r:"",args:((s=i[2])!=null?s:"").trim()});return t}function $(e){var t;return(t=e.rotate)!=null?t:0}function E(e){return W(e.transform).some(t=>t.name==="translate"||t.name==="scale")}function g(e){return H(e.width)}function y(e){return H(e.height)}function H(e){var n;if(!e)return null;let t=e.trim().match(/^(\d+(?:\.\d+)?)px$/);return t?parseFloat((n=t[1])!=null?n:""):null}function C(e){return(Math.round(e/90)%4+4)%4}function R(e,t){if(!isFinite(e)||e<=0)return 1;let n=C(t);return n===1||n===3?1/e:e}function _(e,t){if(!isFinite(e)||e<=0)return{w:100,h:100};let n=C(t);return n===1||n===3?{w:e*100,h:1/e*100}:{w:100,h:100}}function m(e,t,n){let i=n*Math.PI/180;return{w:Math.abs(e*Math.cos(i))+Math.abs(t*Math.sin(i)),h:Math.abs(e*Math.sin(i))+Math.abs(t*Math.cos(i))}}function I(e,t,n){return Math.round(m(e,t,n).w)}function w(e){let{widthPx:t,heightPx:n,naturalRatio:i,deg:r}=e,s=i!=null&&isFinite(i)&&i>0;if(t!=null&&n!=null){let l=m(t,n,r);return{width:Math.round(l.w),height:Math.round(l.h)}}return t!=null?s?{width:Math.round(m(t,t/i,r).w)}:{width:Math.round(t)}:n!=null?s?{height:Math.round(m(n*i,n,r).h)}:{height:Math.round(n)}:{}}function G(e){if(e.heightPx&&e.heightPx>0)return Math.round(e.heightPx);let t=e.aspectRatio&&e.aspectRatio>0?e.aspectRatio:1/.7;return e.widthPx&&e.widthPx>0?Math.round(e.widthPx/t):480}var K=250;function N(e){return G(e)>K}var x="lie-image-area",L="lie-frame";function V(e,t){var f;tt(e);let n=et(e),i=e.parentElement;t.layout==="inline"&&n.classList.add(p);let r=t.layout&&t.layout!=="inline"?`lie-${t.layout}`:null,l=(t.layout==="float-left"||t.layout==="float-right")&&N({widthPx:g(t),heightPx:y(t),aspectRatio:t.aspectRatio?F(t.aspectRatio):null});nt(n,[...t.classes,...r?[r]:[],...l?["lie-tall"]:[]],"lieClasses"),e.style.filter=(f=t.filter)!=null?f:"",X(n,t),Z(i,t),J(e,n,i,t)}function X(e,t){if(t.box)for(let[n,i]of Object.entries(t.box))e.style.setProperty(n,i);E(t)||(t.width&&(e.style.width=t.width),t.height&&(e.style.height=t.height),t.aspectRatio&&(e.style.aspectRatio=t.aspectRatio))}function Z(e,t){let n=["translate(-50%, -50%)"];t.rotate&&n.push(`rotate(${t.rotate}deg)`),t.flipH&&n.push("scaleX(-1)"),t.flipV&&n.push("scaleY(-1)"),e.style.transform=n.join(" ")}function J(e,t,n,i){var f,h,d;let r=$(i);if(E(i)){e.style.transform=(f=i.transform)!=null?f:"",e.classList.add("lie-crop-fit");let a=(h=Q(i))!=null?h:1;O(t,n,a,r);let c=g(i);c?t.style.width=`${Math.round(m(c,c/a,r).w)}px`:i.width?t.style.width=i.width:D(e,(u,o)=>{t.style.width=`${I(u,o,r)}px`});return}e.style.transform=(d=i.transform)!=null?d:"",t.style.setProperty("--lie-auto-aspect",i.aspectRatio||"1");let s=g(i),l=y(i);if(s!=null&&l!=null){let a=w({widthPx:s,heightPx:l,naturalRatio:null,deg:r});a.width!=null&&(t.style.width=`${a.width}px`),a.height!=null&&(t.style.height=`${a.height}px`)}if(i.aspectRatio){let a=F(i.aspectRatio);if(a){let c=R(a,r);c!==a&&(t.style.aspectRatio=String(c))}}D(e,(a,c)=>{if(O(t,n,a/c,r),!i.width&&!i.height)t.style.width=`${I(a,c,r)}px`;else if(s!=null&&l==null){let u=w({widthPx:s,heightPx:null,naturalRatio:a/c,deg:r});u.width!=null&&(t.style.width=`${u.width}px`)}else if(l!=null&&s==null){let u=w({widthPx:null,heightPx:l,naturalRatio:a/c,deg:r});u.height!=null&&(t.style.height=`${u.height}px`)}})}function D(e,t){let n=()=>{let s=e.naturalWidth,l=e.naturalHeight;return!s||!l?!1:(t(s,l),!0)};if(n())return;e.addEventListener("load",()=>{n()},{once:!0});let i=0,r=()=>{n()||++i>20||!e.isConnected||window.setTimeout(r,50)};window.setTimeout(r,0)}function O(e,t,n,i){e.style.setProperty("--lie-auto-aspect",String(R(n,i)));let r=_(n,i);t.style.width=`${r.w}%`,t.style.height=`${r.h}%`}function Q(e){let t=F(e.aspectRatio);if(t)return t;let n=g(e),i=y(e);return n&&i?n/i:null}function F(e){var r;if(!e)return null;let t=e.match(/^\s*([\d.]+)\s*(?:\/\s*([\d.]+))?\s*$/);if(!t)return null;let n=parseFloat((r=t[1])!=null?r:""),i=t[2]?parseFloat(t[2]):1;return n>0&&i>0?n/i:null}function tt(e){e.classList.remove(T,p),v(e,"lieMarkers"),v(e,"lieClasses"),e.style.removeProperty("transform"),e.style.removeProperty("filter"),e.classList.remove("lie-crop-fit");let t=e.parentElement;for(let n=0;n<2&&t&&(t.classList.contains(L)||t.classList.contains(x));n++)t.classList.contains(x)&&(v(t,"lieClasses"),t.classList.remove(p)),t.removeAttribute("style"),t=t.parentElement}function et(e){let t=e.parentElement;if(t&&t.classList.contains(L)){let r=t.parentElement;if(r&&r.classList.contains(x))return r}if(t&&t.classList.contains(x)){let r=document.createElement("span");return r.classList.add(L),t.insertBefore(r,e),r.appendChild(e),t}let n=document.createElement("span");n.classList.add(x);let i=document.createElement("span");return i.classList.add(L),t==null||t.insertBefore(n,e),n.appendChild(i),i.appendChild(e),n}function nt(e,t,n){let i=t.filter(Boolean);for(let r of i)e.classList.add(r);i.length?e.dataset[n]=i.join(" "):delete e.dataset[n]}function v(e,t){let n=e.dataset[t];if(n){for(let i of n.split(" "))i&&e.classList.remove(i);delete e.dataset[t]}}var j=`
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
`,S='[rotate],[flip],[transform],[aspect-ratio],[filter],.lie,.lie-inline,[align="center"],[align^="block-"],[data-align="center"],[data-align^="block-"],[data-rotate],[data-flip],[data-transform],[data-aspect-ratio],[data-filter]';function b(e,t){var n;return(n=e.getAttribute(t))!=null?n:e.getAttribute(`data-${t}`)}function B(e){var a,c,u;let t={classes:[]},n=b(e,"rotate");if(n!=null){let o=parseFloat(n);Number.isNaN(o)||(t.rotate=o)}let i=b(e,"flip");if(i)for(let o of i.split(/[\s,]+/).filter(Boolean))o==="horizontal"||o==="h"?t.flipH=!0:o==="vertical"||o==="v"?t.flipV=!0:o==="both"&&(t.flipH=!0,t.flipV=!0);let r=b(e,"transform");r&&(t.transform=r);let s=b(e,"filter");s&&(t.filter=s);let l=b(e,"aspect-ratio");l&&(t.aspectRatio=l);let f=(a=e.getAttribute("width"))!=null?a:e.getAttribute("data-width");f&&(t.width=/^\d+(?:\.\d+)?$/.test(f.trim())?`${f.trim()}px`:f.trim());let h=(c=e.getAttribute("height"))!=null?c:e.getAttribute("data-height");h&&(t.height=/^\d+(?:\.\d+)?$/.test(h.trim())?`${h.trim()}px`:h.trim());let d=(u=e.getAttribute("align"))!=null?u:e.getAttribute("data-align");if(d){let o=M[d];o&&(t.layout=o)}for(let o of Array.from(e.classList)){if(o==="lie"||o===T)continue;if(o===p){t.layout="inline";continue}let k=P[o];if(k){t.layout=k;continue}t.classes.push(o)}return t}var z=`/* Live Image Editor \u2014 example image decoration classes.
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
`;var it=`
.lie-image-area.lie-float-left { float: left; clear: none; margin: 0 1em 0.5em 0; }
.lie-image-area.lie-float-right { float: right; clear: none; margin: 0 0 0.5em 1em; }
.lie-image-area.lie-block-left { display: block; margin-right: auto; }
.lie-image-area.lie-block-center { display: block; margin-left: auto; margin-right: auto; }
.lie-image-area.lie-block-right { display: block; margin-left: auto; }
`,Y=new Set;function A(e,t){if(Y.has(e))return;Y.add(e);let n=new CSSStyleSheet;n.replaceSync(t),document.adoptedStyleSheets=[...document.adoptedStyleSheets,n]}function rt(e){let t=[];if(e instanceof HTMLImageElement&&e.matches(S)&&t.push(e),e instanceof Element||e instanceof Document)for(let n of Array.from(e.querySelectorAll(S)))n instanceof HTMLImageElement&&t.push(n);return t}function q(e){for(let t of rt(e))t.closest(".lie-frame")||V(t,B(t))}function U(){A("lie-runtime-render-css",j),A("lie-runtime-css",it),A("lie-runtime-snippet-css",z),q(document),new MutationObserver(t=>{for(let n of t)for(let i of Array.from(n.addedNodes))q(i)}).observe(document.documentElement,{childList:!0,subtree:!0})}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",U,{once:!0}):U();})();
