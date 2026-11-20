/// <reference path="../pb_data/types.d.ts" />

// Menghubungkan pengajuan pinjaman karyawan ke transaksi Biaya agar akuntan
// dapat memprosesnya ke pembukuan. Mengubah aturan akses transactions agar
// selaras dengan entries/employee_loans (perusahaan + anggota aktif), membuat
// debit_account/credit_account opsional (transaksi pinjaman pending belum
// memiliki akun), dan menambah relasi `loan` ke employee_loans.

const COMPANY_RULE =
  "@request.auth.id != '' && (owner = @request.auth.id || company.owner = @request.auth.id || (@collection.company_members.user ?= @request.auth.id && @collection.company_members.company ?= company && @collection.company_members.status ?= 'active'))";

migrate(
  (app) => {
    const transactions = app.findCollectionByNameOrId("transactions");
    const employeeLoans = app.findCollectionByNameOrId("employee_loans");

    // Lebarkan aturan akses agar akuntan/anggota perusahaan dapat melihat dan
    // memproses transaksi (termasuk pengajuan pinjaman dari karyawan).
    transactions.listRule = COMPANY_RULE;
    transactions.viewRule = COMPANY_RULE;
    transactions.updateRule = COMPANY_RULE;
    transactions.deleteRule = COMPANY_RULE;

    // Akun debit/kredit jadi opsional: transaksi pengajuan pinjaman pending
    // belum memiliki akun sampai akuntan memprosesnya.
    const debit = transactions.fields.getByName("debit_account");
    if (debit) debit.required = false;
    const credit = transactions.fields.getByName("credit_account");
    if (credit) credit.required = false;

    // Relasi ke pengajuan pinjaman (opsional, tidak cascade — menghapus
    // transaksi tidak menghapus data pinjaman).
    if (!transactions.fields.getByName("loan")) {
      transactions.fields.add(
        new RelationField({
          name: "loan",
          required: false,
          maxSelect: 1,
          collectionId: employeeLoans.id,
          cascadeDelete: false,
        }),
      );
    }

    app.save(transactions);
  },
  (app) => {
    try {
      const transactions = app.findCollectionByNameOrId("transactions");
      transactions.listRule = "@request.auth.id != '' && @request.auth.id = owner";
      transactions.viewRule = "@request.auth.id != '' && @request.auth.id = owner";
      transactions.updateRule = "@request.auth.id != '' && @request.auth.id = owner";
      transactions.deleteRule = "@request.auth.id != '' && @request.auth.id = owner";

      const debit = transactions.fields.getByName("debit_account");
      if (debit) debit.required = true;
      const credit = transactions.fields.getByName("credit_account");
      if (credit) credit.required = true;

      const loan = transactions.fields.getByName("loan");
      if (loan) transactions.fields.remove(loan);

      app.save(transactions);
    } catch (e) {
      if (e.message.includes("no rows in result set")) return;
      throw e;
    }
  },
);
