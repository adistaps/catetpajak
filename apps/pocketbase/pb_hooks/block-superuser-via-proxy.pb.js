/// <reference path="../pb_data/types.d.ts" />

// Lapis pertahanan kedua untuk login superuser.
//
// Proxy web `/hcgi/platform` (apps/web/server.ts) menandai setiap permintaan yang ia teruskan dengan
// header `x-via-web-proxy: 1` (nilai dari klien selalu ditimpa). Hook ini menolak SEMUA bentuk
// autentikasi superuser (password, refresh, OTP, OAuth2) yang membawa tanda itu.
// Server web memanggil PocketBase langsung (tanpa proxy), dan admin masuk lewat 127.0.0.1:8090
// (terowongan SSH), jadi keduanya tidak terpengaruh.
onRecordAuthRequest((e) => {
  let viaProxy = "";
  try {
    // PocketBase menormalkan nama header: huruf kecil dan "-" menjadi "_".
    viaProxy = String(e.requestInfo().headers["x_via_web_proxy"] || "");
  } catch (err) {
    viaProxy = "";
  }
  if (viaProxy === "") {
    try {
      viaProxy = String(e.requestEvent.request.header.get("x-via-web-proxy") || "");
    } catch (err) {
      viaProxy = "";
    }
  }
  if (viaProxy !== "") {
    throw new ForbiddenError("Login superuser tidak diizinkan dari jaringan publik.");
  }
  return e.next();
}, "_superusers");
