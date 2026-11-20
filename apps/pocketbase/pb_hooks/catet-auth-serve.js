var path = "";
var method = "";
try {
  method = String((e.request && e.request.method) || "").toUpperCase();
  path = String((e.request && e.request.url && e.request.url.path) || "");
} catch (err) {
  return e.next();
}

if (method !== "GET" && method !== "HEAD") return e.next();

var internal = "";
try {
  internal = String(e.request.header.get("X-Catet-Internal") || "");
} catch (err) {
  internal = "";
}
if (internal === "1") return e.next();

var isIndex = /(?:^|\/)_\/?$/.test(path) || /\/_\/index\.html$/.test(path);
if (!isIndex) return e.next();

function bytesToString(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  try {
    var text = toString(value);
    if (text && text.indexOf("[object") !== 0) return text;
  } catch (err2) {}
  if (Array.isArray(value)) {
    var out = "";
    for (var i = 0; i < value.length; i += 8000) {
      out += String.fromCharCode.apply(null, value.slice(i, i + 8000));
    }
    return out;
  }
  return String(value);
}

var html = "";
try {
  // Fetch the admin UI shell from the same CDN external-dashboard uses.
  // Do NOT self-call http://127.0.0.1:8090/_/index.html from inside a routerUse
  // middleware: PocketBase's JSVM is single-threaded, so a blocking HTTP call
  // back to the same instance deadlocks (the inner request's middleware can
  // never run) and the request hangs until it times out.
  var rawVersion = $os.readFile(__hooks + "/../.pocketbase-version");
  var versionStr = bytesToString(rawVersion).replace(/\n/g, "").trim();
  var cdnUrl = "https://horizons-static-cdn.hostinger.com/pocketbase/v" + versionStr + "/ui/dist/index.html";
  var res = $http.send({
    url: cdnUrl,
    method: "GET",
    timeout: 8,
    headers: { "Accept": "text/html" },
  });
  html = bytesToString(res.raw || res.body);
} catch (err) {
  html = "";
}
if (!html || html.indexOf("<html") === -1) return e.next();

var js = "";
try {
  js = bytesToString($os.readFile(__hooks + "/catet-auth-theme.js"));
} catch (err) {
  js = "";
}

var css = '<style id="catet-auth-css">html.catet-auth-pending,html.catet-auth-pending body{background:#f3f7fb!important}html.catet-auth-pending body{visibility:hidden}#catet-auth-shell{position:fixed;inset:0;z-index:2147483646;overflow:auto;background:#f3f7fb;color:#0f2744;font-family:Inter,system-ui,-apple-system,sans-serif}#catet-auth-shell *{box-sizing:border-box}#catet-auth-shell .bg{pointer-events:none;position:absolute;inset:0;overflow:hidden}#catet-auth-shell .blob-a{position:absolute;left:-6rem;top:2.5rem;height:18rem;width:42rem;border-radius:999px;background:rgba(255,255,255,.8);filter:blur(24px)}#catet-auth-shell .blob-b{position:absolute;right:-4rem;top:-6%;height:28rem;width:28rem;border-radius:999px;border:28px solid rgba(255,255,255,.7)}#catet-auth-shell .blob-c{position:absolute;right:-4%;top:18%;height:16rem;width:16rem;border-radius:999px;background:rgba(255,255,255,.9)}#catet-auth-shell .blob-d{position:absolute;bottom:-8%;right:-6%;height:18rem;width:18rem;border-radius:999px;background:rgba(236,253,245,.8)}#catet-auth-shell .wave{position:absolute;left:0;right:0;bottom:0;height:180px;background:#fff;border-radius:50% 50% 0 0 / 80px 80px 0 0;box-shadow:0 -30px 80px rgba(15,39,68,.04)}#catet-auth-shell .wrap{position:relative;margin:0 auto;display:flex;min-height:100dvh;width:100%;max-width:1180px;flex-direction:column;justify-content:center;padding:2.5rem 1.25rem}#catet-auth-shell .grid{display:grid;align-items:center;gap:2.5rem}@media(min-width:1024px){#catet-auth-shell .grid{grid-template-columns:1fr 440px;gap:4rem}#catet-auth-shell .wrap{padding-left:2rem;padding-right:2rem}#catet-auth-shell .card{justify-self:end}}#catet-auth-shell .brand{display:inline-flex;align-items:center;gap:.75rem;text-decoration:none;color:inherit}#catet-auth-shell .brand img{width:48px;height:48px;object-fit:contain;mix-blend-mode:multiply}#catet-auth-shell .word{font-size:28px;font-weight:800;letter-spacing:-.03em;color:#12315a}#catet-auth-shell .word span{color:#10b981}#catet-auth-shell h1{margin:2rem 0 0;font-size:34px;line-height:1.15;font-weight:800;letter-spacing:-.03em;color:#102a4c}@media(min-width:640px){#catet-auth-shell h1{font-size:40px}}#catet-auth-shell .bar{margin-top:1rem;height:4px;width:3.5rem;border-radius:999px;background:#34d399}#catet-auth-shell .lead{margin:.9rem 0 0;font-size:15px;color:#64748b}#catet-auth-shell .card{width:100%;border-radius:28px;border:1px solid rgba(255,255,255,.8);background:rgba(255,255,255,.92);padding:1.5rem;box-shadow:0 24px 60px rgba(16,42,76,.08)}@media(min-width:640px){#catet-auth-shell .card{padding:2rem}}#catet-auth-shell h2{margin:0;font-size:26px;font-weight:800;letter-spacing:-.03em;color:#102a4c}#catet-auth-shell .sub{margin:.35rem 0 0;font-size:14px;color:#64748b;line-height:1.5}#catet-auth-shell .sub strong{color:#102a4c;font-weight:700}#catet-auth-shell form{margin-top:1.4rem;display:flex;flex-direction:column;gap:1rem}#catet-auth-shell label{display:flex;flex-direction:column;gap:.4rem;font-size:13px;font-weight:600;color:#12315a}#catet-auth-shell .req{color:#ef4444}#catet-auth-shell .field{position:relative}#catet-auth-shell input{height:44px;width:100%;border-radius:12px;border:1px solid #e2e8f0;background:#fff;padding:0 2.6rem 0 .9rem;font-size:14px;color:#0f172a;outline:none}#catet-auth-shell input:focus{border-color:#10b981;box-shadow:0 0 0 3px #d1fae5}#catet-auth-shell .eye{position:absolute;right:.35rem;top:50%;transform:translateY(-50%);width:32px;height:32px;border:0;border-radius:999px;background:transparent;color:#94a3b8;cursor:pointer;display:flex;align-items:center;justify-content:center}#catet-auth-shell .note{border-radius:12px;padding:.7rem .85rem;font-size:14px;font-weight:500;line-height:1.45}#catet-auth-shell .err{border:1px solid #fecaca;background:#fef2f2;color:#dc2626}#catet-auth-shell .ok{border:1px solid #a7f3d0;background:#ecfdf5;color:#065f46;margin-top:1.25rem}#catet-auth-shell button[type=submit],#catet-auth-shell .go{height:48px;border:0;border-radius:12px;background:linear-gradient(90deg,#0f3d32,#059669);color:#fff;font-size:15px;font-weight:600;cursor:pointer;box-shadow:inset 0 1px 0 rgba(255,255,255,.25)}#catet-auth-shell button[type=submit]:disabled{opacity:.6;cursor:not-allowed}#catet-auth-shell .go{display:flex;align-items:center;justify-content:center;text-decoration:none;margin-top:1rem}#catet-auth-shell .back{display:inline-flex;margin-top:.25rem;font-size:14px;font-weight:500;color:#64748b;text-decoration:none}#catet-auth-shell .copy{margin-top:2.5rem;font-size:12px;color:#94a3b8}</style>';

var boot = '<script>(function(){var h=location.hash||"",p=location.pathname||"";if(h.indexOf("confirm-password-reset")!==-1||p.indexOf("confirm-password-reset")!==-1){document.documentElement.classList.add("catet-auth-pending");}})();</script>';
if (html.indexOf("catet-auth-css") === -1) {
  html = html.indexOf("</head>") !== -1 ? html.replace("</head>", boot + css + "</head>") : boot + css + html;
}
if (js && html.indexOf("id=\"catet-auth-shell\"") === -1 && html.indexOf("catet-auth-theme") === -1) {
  html = html.indexOf("</body>") !== -1
    ? html.replace("</body>", "<script id=\"catet-auth-theme\">" + js + "</script></body>")
    : html + "<script id=\"catet-auth-theme\">" + js + "</script>";
}

try {
  e.response.header().set("Cache-Control", "no-store");
} catch (err) {}
return e.html(200, html);
