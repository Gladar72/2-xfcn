cat > "app/(app)/events/[id]/mesto-event.css" << 'ENDOFFILE'
@font-face{font-family:Inter;src:url('/mesto/assets/fonts/InterVariable.woff2') format('woff2');font-weight:100 900;font-style:normal;font-display:swap}
.mesto{
 --m-ink:#160631;--m-purple:#7430FF;--m-purple-dark:#340B83;--m-muted:#77757F;
 --m-lilac:#F1EAFF;--m-white:#FFFFFF;--m-radius:22px;--m-gap:12px;--m-pad:20px;
 --m-safe-bottom:max(env(safe-area-inset-bottom,0px),var(--tg-safe-area-inset-bottom,0px),var(--tg-content-safe-area-inset-bottom,0px));
 --m-safe-top:max(env(safe-area-inset-top,0px),var(--tg-safe-area-inset-top,0px),var(--tg-content-safe-area-inset-top,0px));
 --m-safe-left:max(env(safe-area-inset-left,0px),var(--tg-safe-area-inset-left,0px),var(--tg-content-safe-area-inset-left,0px));
 --m-safe-right:max(env(safe-area-inset-right,0px),var(--tg-safe-area-inset-right,0px),var(--tg-content-safe-area-inset-right,0px));
 --m-nav-height:72px;
 font:400 14px/1.45 Inter,Arial,sans-serif;font-optical-sizing:auto;color:var(--m-ink);color-scheme:light;
 overscroll-behavior:none;
 background:radial-gradient(ellipse at 0% 18%,#EDE5FF 0,transparent 32%),radial-gradient(ellipse at 100% 75%,#FCEEF7 0,transparent 31%),radial-gradient(ellipse at 6% 96%,#F0E9FF 0,transparent 24%),#fff;
}
.mesto,.mesto *,.mesto *::before,.mesto *::after{box-sizing:border-box}
.mesto button,.mesto a{-webkit-tap-highlight-color:transparent;touch-action:manipulation}
.mesto button{font:inherit;color:inherit;cursor:pointer;border:0}
.mesto button:disabled{cursor:default;opacity:.55}
.mesto button:focus-visible,.mesto a:focus-visible{outline:3px solid var(--m-purple);outline-offset:4px}
.mesto img{display:block;max-width:100%}
.m-page{width:100%;max-width:480px;margin-inline:auto;padding:calc(16px + var(--m-safe-top)) calc(var(--m-pad) + var(--m-safe-right)) calc(var(--m-nav-height) + var(--m-safe-bottom) + 24px) calc(var(--m-pad) + var(--m-safe-left))}
.m-badge{display:inline-flex;align-items:center;gap:7px;padding:5px 11px 5px 8px;background:#EEE5FF;border-radius:999px;color:var(--m-purple);font-size:13px;font-weight:600;max-width:100%}
.m-badge img{width:20px;height:20px;object-fit:contain;flex:none}
.m-title{font-size:32px;line-height:1.12;font-weight:800;letter-spacing:-1.05px;margin:9px 0 14px;overflow-wrap:anywhere}
.m-hero{margin:0}
.m-photo{width:100%;height:auto;aspect-ratio:1.4;object-fit:cover;object-position:50% 43%;border-radius:var(--m-radius);background:#E7E0EF}
.m-organizer{position:relative;margin-top:-36px;width:calc(100% - 8px);margin-inline:auto;display:flex;align-items:center;gap:12px;padding:10px 14px;min-height:64px;background:#fff;border-radius:22px;box-shadow:0 12px 26px #36158512;text-align:left}
.m-avatar{width:42px;height:42px;flex:none;object-fit:cover;border-radius:50%;background:#F1EAFF}
.m-organizer-copy{display:flex;flex-direction:column;min-width:0;gap:2px}
.m-organizer-name{font-size:14px;font-weight:500;overflow-wrap:anywhere}
.m-rating{display:flex;align-items:center;gap:4px;font-size:11px;color:var(--m-muted);flex-wrap:wrap}
.m-rating img{width:16px;height:16px}
.m-details{display:grid;gap:8px;margin:20px 0 0}
.m-info{display:flex;align-items:center;gap:12px;min-width:0;min-height:44px;padding:10px 12px;border-radius:16px;background:#F6F5F8;margin:0}
.m-info>img{width:26px;height:26px;object-fit:contain;flex:none}
.m-info>span{min-width:0;overflow-wrap:anywhere}
.m-date{background:#F0E9FF;font-weight:500}
.m-address{color:#504A5D}
.m-chips{display:grid;grid-template-columns:minmax(0,1.16fr) minmax(0,1fr);gap:8px}
.m-chips .m-info{font-size:12px;gap:8px;line-height:1.35}
.m-capacity{background:#F6F1FF}
.m-price{background:#FFF7F1}
.m-description{font-size:14px;margin:10px 0 16px;white-space:pre-wrap;overflow-wrap:anywhere}
.m-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.m-action{width:100%;min-width:0;min-height:76px;padding:10px 12px;border-radius:22px;display:flex;justify-content:center;align-items:center;gap:10px;text-align:left;box-shadow:0 7px 20px #45227809;transition:transform .15s ease,box-shadow .15s ease}
.mesto .m-action:active:not(:disabled){transform:scale(.98)}
.m-action img{width:52px;height:52px;flex:none;object-fit:contain}
.m-action-label{overflow-wrap:anywhere;font-size:15px;line-height:1.25;font-weight:750;min-width:0}
.mesto .m-requests{color:#fff;background:linear-gradient(128deg,#7735FF 0%,#9250EB 45%,#FF8A4E 100%)}
.mesto .m-boost{color:var(--m-purple);background:#F7F2FF}
.m-cancel{margin-top:12px;min-height:58px;background:#fff;text-align:center;gap:10px;padding:7px 16px;box-shadow:0 10px 30px #3714730C}
.m-cancel img{width:44px;height:44px}
.mesto .m-cancel .m-action-label{color:var(--m-purple-dark);font-size:15px;line-height:1.3;font-weight:750}
.m-nav{position:fixed;z-index:20;left:50%;transform:translateX(-50%);bottom:0;width:100%;max-width:480px;display:grid;grid-template-columns:repeat(5,minmax(0,1fr));height:calc(var(--m-nav-height) + var(--m-safe-bottom));padding:6px calc(8px + var(--m-safe-right)) calc(6px + var(--m-safe-bottom)) calc(8px + var(--m-safe-left));border-radius:28px 28px 0 0;background:rgba(255,255,255,.97);box-shadow:0 -6px 25px #3B185907}
.m-nav-item{background:transparent;display:flex;min-width:0;flex-direction:column;align-items:center;justify-content:center;gap:5px;text-decoration:none;color:var(--m-muted)!important;font-size:11px!important;line-height:1.2;padding:0 2px!important}
.m-nav-item img{width:24px;height:24px;object-fit:contain}
.m-nav-item[aria-current=page]{color:var(--m-purple)!important}
.m-nav-item[aria-current=page] img{width:34px;height:34px;margin-top:-10px;filter:drop-shadow(0 4px 6px #7631FF25)}
.m-sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
.m-demo-note{position:fixed;z-index:30;left:50%;transform:translateX(-50%);bottom:calc(var(--m-nav-height) + var(--m-safe-bottom) + 8px);width:max-content;max-width:calc(100% - 32px);padding:10px 14px;border-radius:12px;background:#2A0A55;color:white;box-shadow:0 5px 20px #2A0A5530;font-size:13px;text-align:center}
.m-demo-note[hidden]{display:none}
@media(max-width:359px){.mesto{--m-pad:16px}.m-title{font-size:29px}.m-action{gap:7px;padding-inline:10px}.m-action img{width:40px;height:44px}.m-action-label{font-size:13px}.m-cancel img{width:42px;height:42px}.mesto .m-cancel .m-action-label{font-size:14px}.m-chips .m-info{gap:6px;padding-inline:10px;font-size:11px}}
@media(prefers-reduced-motion:reduce){.m-action{transition:none}}
ENDOFFILE
