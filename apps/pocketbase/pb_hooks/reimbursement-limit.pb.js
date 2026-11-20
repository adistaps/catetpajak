/// <reference path="../pb_data/types.d.ts" />

// Penegakan batas nominal maksimum reimbursement di sisi server.
// Klien sudah memeriksa batas sebelum mengirim, tetapi pemeriksaan ini
// menjamin nominal yang melebihi batas untuk jenis reimbursement tertentu
// tetap ditolak meskipun permintaan dibuat langsung lewat API. Hanya
// berlaku saat membuat pengajuan baru — pengajuan lama tidak terpengaruh.

onRecordCreateRequest((e) => {
  // Ambil id pengaturan jenis reimbursement yang ditautkan.
  let settingId = "";
  try {
    settingId = e.record.getString("setting") || "";
  } catch (_) {
    settingId = "";
  }
  if (!settingId) {
    e.next();
    return;
  }

  // Muat pengaturan jenis reimbursement.
  let setting;
  try {
    setting = $app.findRecordById("reimbursement_settings", settingId);
  } catch (err) {
    // Pengaturan tidak ditemukan — lewati, biarkan aturan koleksi menangani.
    e.next();
    return;
  }

  const amount = Number(e.record.get("amount")) || 0;

  // Batas umum per pengajuan (0 = tanpa batas).
  const generalLimit = Number(setting.get("amount_limit")) || 0;

  // Batas per level karyawan: jika karyawan punya level dan level tersebut
  // memiliki batas khusus, pakai batas level itu; jika tidak, jatuh ke batas umum.
  let levelLimit = 0;
  let hasLevelLimit = false;
  let employeeId = "";
  try {
    employeeId = e.record.getString("employee") || "";
  } catch (_) {
    employeeId = "";
  }
  if (employeeId) {
    try {
      const employee = $app.findRecordById("employees", employeeId);
      let level = "";
      try {
        level = (employee.getString("level") || "").trim();
      } catch (_) {
        level = "";
      }
      if (level) {
        let limits = {};
        try {
          const raw = setting.get("level_limits");
          if (raw) {
            limits = JSON.parse(JSON.stringify(raw));
          }
        } catch (_) {
          limits = {};
        }
        if (limits && Object.prototype.hasOwnProperty.call(limits, level)) {
          levelLimit = Number(limits[level]) || 0;
          hasLevelLimit = true;
        }
      }
    } catch (err) {
      // Karyawan tidak ditemukan — abaikan dan pakai batas umum.
    }
  }

  const applicableLimit = hasLevelLimit ? levelLimit : generalLimit;
  if (applicableLimit > 0 && amount > applicableLimit) {
    const fmt = (n) => {
      const rounded = Math.round(Number(n) || 0);
      const sign = rounded < 0 ? "-" : "";
      const s = String(Math.abs(rounded));
      let out = "";
      let count = 0;
      for (let i = s.length - 1; i >= 0; i--) {
        if (count === 3) {
          out = "." + out;
          count = 0;
        }
        out = s[i] + out;
        count++;
      }
      return "Rp" + sign + out;
    };

    let settingName = "";
    try {
      settingName = setting.getString("name") || "";
    } catch (_) {
      settingName = "";
    }

    throw new BadRequestError(
      "Nominal reimbursement " +
        fmt(amount) +
        " melebihi batas maksimum " +
        fmt(applicableLimit) +
        ' untuk jenis "' +
        settingName +
        '". Silakan ajukan dengan nominal maksimal ' +
        fmt(applicableLimit) +
        "."
    );
  }

  // Validasi sisa saldo per jenis: budget dikurangi total pengajuan yang belum
  // ditolak (pending/approved/paid). Hanya berlaku bila budget > 0. Pengajuan
  // lama tidak berubah; pengajuan yang ditolak tidak mengurangi saldo.
  const budget = Number(setting.get("budget")) || 0;
  if (budget > 0) {
    let used = 0;
    try {
      const existing = $app.findRecordsByFilter(
        "reimbursements",
        'setting = "' + settingId + '" && status != "rejected"',
        "",
        0,
        0
      );
      for (const r of existing) {
        used += Number(r.get("amount")) || 0;
      }
    } catch (err) {
      // Gagal memuat pengajuan — lewati, biarkan aturan koleksi menangani.
    }
    if (used + amount > budget) {
      const fmtSaldo = (n) => {
        const rounded = Math.round(Number(n) || 0);
        const sign = rounded < 0 ? "-" : "";
        const s = String(Math.abs(rounded));
        let out = "";
        let count = 0;
        for (let i = s.length - 1; i >= 0; i--) {
          if (count === 3) {
            out = "." + out;
            count = 0;
          }
          out = s[i] + out;
          count++;
        }
        return "Rp" + sign + out;
      };
      let saldoSettingName = "";
      try {
        saldoSettingName = setting.getString("name") || "";
      } catch (_) {
        saldoSettingName = "";
      }
      throw new BadRequestError(
        "Sisa saldo untuk jenis \"" +
          saldoSettingName +
          "\" tidak mencukupi. Sisa " +
          fmtSaldo(Math.max(0, budget - used)) +
          " dari total " +
          fmtSaldo(budget) +
          "."
      );
    }
  }

  e.next();
}, "reimbursements");
