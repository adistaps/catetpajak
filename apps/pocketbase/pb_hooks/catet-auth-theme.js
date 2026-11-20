(function () {
  var MARK = "confirm-password-reset";

  function isReset() {
    var hash = location.hash || "";
    var path = location.pathname || "";
    return hash.indexOf(MARK) !== -1 || path.indexOf(MARK) !== -1;
  }

  // Published and preview sites proxy PocketBase under /hcgi/platform.
  // A reset page opened at /_/#/auth/... still has to POST there; /api/* on
  // the site root is the web app and cannot save the password.
  function apiBase() {
    var path = location.pathname || "/";
    var marker = "/hcgi/platform";
    var idx = path.indexOf(marker);
    if (idx !== -1) return path.slice(0, idx + marker.length);
    return marker;
  }

  function tokenFromLocation() {
    var hash = location.hash || "";
    var i = hash.indexOf(MARK);
    var raw = "";
    if (i !== -1) raw = hash.slice(i + MARK.length);
    else {
      var path = location.pathname || "";
      var j = path.indexOf(MARK);
      if (j !== -1) raw = path.slice(j + MARK.length);
    }
    raw = raw.replace(/^[/:]/, "").split("?")[0].split("&")[0];
    try { return decodeURIComponent(raw); } catch (err) { return raw; }
  }

  function decodePayload(token) {
    try {
      var part = token.split(".")[1];
      if (!part) return null;
      var b64 = part.replace(/-/g, "+").replace(/_/g, "/");
      while (b64.length % 4) b64 += "=";
      return JSON.parse(atob(b64));
    } catch (err) {
      return null;
    }
  }

  function eyeSvg() {
    return '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  }

  function lockSvg() {
    return '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
  }

  function successHtml() {
    return '<p class="note ok">Kata sandi berhasil diperbarui.<br/>Anda bisa masuk dengan kata sandi baru.</p>' +
      '<a class="go" href="/login">Masuk</a>';
  }

  function mount() {
    if (!isReset()) {
      document.documentElement.classList.remove("catet-auth-pending");
      var old = document.getElementById("catet-auth-shell");
      if (old) old.remove();
      var app = document.getElementById("app");
      if (app) app.style.display = "";
      return;
    }
    if (document.getElementById("catet-auth-shell")) return;

    var app = document.getElementById("app");
    if (app) app.style.display = "none";

    var token = tokenFromLocation();
    var claims = decodePayload(token) || {};
    var email = claims.email || "";
    var collectionId = claims.collectionId || "";
    var done = false;

    var shell = document.createElement("div");
    shell.id = "catet-auth-shell";
    shell.innerHTML =
      '<div class="bg" aria-hidden="true">' +
      '<div class="blob-a"></div><div class="wave"></div><div class="blob-b"></div><div class="blob-c"></div><div class="blob-d"></div>' +
      '</div>' +
      '<div class="wrap"><div class="grid">' +
      '<section class="intro">' +
      '<a class="brand" href="/login"><img src="/catet-logo.png" alt="Logo Catet Pajak"/><span class="word">Catet <span>Pajak</span></span></a>' +
      '<h1>Pembukuan, Pajak<br/>&amp; Payroll</h1>' +
      '<div class="bar"></div>' +
      '<p class="lead">Pajak tumbuh, usaha Indonesia tangguh.</p>' +
      '</section>' +
      '<section class="card" id="catet-card"></section>' +
      '</div>' +
      '<p class="copy">&copy; ' + new Date().getFullYear() + ' Catet Pajak. Seluruh hak cipta dilindungi.</p>' +
      '</div>';
    document.body.appendChild(shell);

    var card = shell.querySelector("#catet-card");
    if (done) {
      card.innerHTML = '<h2>Kata sandi diperbarui</h2><p class="sub">Akun Anda siap digunakan kembali.</p>' + successHtml();
    } else {
      card.innerHTML =
        '<h2>Konfirmasi atur ulang kata sandi</h2>' +
        '<p class="sub" id="catet-sub"></p>' +
        '<form id="catet-reset-form">' +
        '<label>Kata sandi baru <span class="req">*</span><span class="field"><span class="lock" aria-hidden="true">' + lockSvg() + '</span><input id="catet-pw" type="password" required minlength="10" autocomplete="new-password" placeholder="Minimal 10 karakter"/><button type="button" class="eye" data-target="catet-pw" aria-label="Tampilkan kata sandi">' + eyeSvg() + '</button></span></label>' +
        '<label>Konfirmasi kata sandi <span class="req">*</span><span class="field"><span class="lock" aria-hidden="true">' + lockSvg() + '</span><input id="catet-pw2" type="password" required minlength="10" autocomplete="new-password" placeholder="Ulangi kata sandi baru"/><button type="button" class="eye" data-target="catet-pw2" aria-label="Tampilkan konfirmasi kata sandi">' + eyeSvg() + '</button></span></label>' +
        '<p id="catet-msg" class="note err" hidden></p>' +
        '<button type="submit" id="catet-submit">Simpan kata sandi</button>' +
        '<a class="back" href="/login">Kembali ke masuk</a>' +
        '</form>';

      var sub = shell.querySelector("#catet-sub");
      if (!token) {
        sub.textContent = "Tautan atur ulang tidak lengkap. Minta tautan baru dari halaman masuk.";
        shell.querySelector("#catet-submit").disabled = true;
      } else if (email) {
        sub.innerHTML = "Ketik kata sandi baru untuk <strong></strong>.";
        sub.querySelector("strong").textContent = email;
      } else {
        sub.textContent = "Ketik kata sandi baru untuk akun Anda. Tautan ini hanya berlaku sebentar.";
      }

      shell.querySelectorAll(".eye").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var input = shell.querySelector("#" + btn.getAttribute("data-target"));
          if (!input) return;
          var show = input.type === "password";
          input.type = show ? "text" : "password";
          btn.setAttribute("aria-label", show ? "Sembunyikan kata sandi" : "Tampilkan kata sandi");
        });
      });

      var msg = shell.querySelector("#catet-msg");
      function showMsg(text, ok) {
        msg.hidden = !text;
        msg.textContent = text || "";
        msg.className = "note " + (ok ? "ok" : "err");
      }

      shell.querySelector("#catet-reset-form").addEventListener("submit", function (event) {
        event.preventDefault();
        var password = shell.querySelector("#catet-pw").value;
        var passwordConfirm = shell.querySelector("#catet-pw2").value;
        if (password.length < 10) {
          showMsg("Kata sandi minimal 10 karakter.");
          return;
        }
        if (password !== passwordConfirm) {
          showMsg("Konfirmasi kata sandi tidak sama.");
          return;
        }
        var submit = shell.querySelector("#catet-submit");
        submit.disabled = true;
        submit.textContent = "Menyimpan…";
        showMsg("");

        var collections = [];
        if (collectionId) collections.push(collectionId);
        collections.push("users", "parents");
        var seen = {};
        collections = collections.filter(function (id) {
          if (!id || seen[id]) return false;
          seen[id] = true;
          return true;
        });

        var attempt = 0;
        function next() {
          if (attempt >= collections.length) {
            submit.disabled = false;
            submit.textContent = "Simpan kata sandi";
            showMsg("Tautan tidak valid atau sudah kedaluwarsa. Minta tautan baru dari halaman masuk.");
            return;
          }
          var id = collections[attempt++];
          fetch(apiBase() + "/api/collections/" + encodeURIComponent(id) + "/confirm-password-reset", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: token, password: password, passwordConfirm: passwordConfirm })
          }).then(function (res) {
            if (res.ok) {
              card.innerHTML = '<h2>Kata sandi diperbarui</h2><p class="sub">Akun Anda siap digunakan kembali.</p>' + successHtml();
              return;
            }
            return res.json().catch(function () { return {}; }).then(function (body) {
              var data = body && body.data ? body.data : {};
              var passwordError = (data.password && data.password.message) || (data.passwordConfirm && data.passwordConfirm.message);
              var tokenError = data.token && data.token.message;
              if (res.status === 400 && passwordError) {
                submit.disabled = false;
                submit.textContent = "Simpan kata sandi";
                showMsg("Kata sandi ditolak: " + passwordError);
                return;
              }
              // Wrong collection or a stale token both come back as 400.
              // Keep trying the other auth collections before telling the user.
              if ((res.status === 400 || res.status === 404) && attempt < collections.length) {
                next();
                return;
              }
              submit.disabled = false;
              submit.textContent = "Simpan kata sandi";
              if (tokenError || res.status === 400) {
                showMsg("Tautan tidak valid atau sudah kedaluwarsa. Minta tautan baru dari halaman masuk.");
                return;
              }
              showMsg("Gagal menyimpan kata sandi. Muat ulang halaman dari tautan email, lalu coba lagi.");
            });
          }).catch(function () {
            submit.disabled = false;
            submit.textContent = "Simpan kata sandi";
            showMsg("Tidak dapat terhubung. Periksa jaringan lalu coba lagi.");
          });
        }
        next();
      });
    }

    document.documentElement.classList.remove("catet-auth-pending");
  }

  function boot() {
    mount();
    var ticks = 0;
    var timer = setInterval(function () {
      ticks += 1;
      if (document.getElementById("catet-auth-shell") || ticks > 40) {
        clearInterval(timer);
        return;
      }
      if (isReset()) mount();
    }, 150);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
  window.addEventListener("hashchange", mount);
})();
