/// <reference path="../pb_data/types.d.ts" />

// Akses jadwal hanya melalui endpoint terotorisasi; daftar penugasan tidak
// boleh terbaca langsung oleh karyawan atau anggota perusahaan lain.
migrate((app) => {
  const companies = app.findCollectionByNameOrId('companies');
  const employees = app.findCollectionByNameOrId('employees');
  const users = app.findCollectionByNameOrId('users');
  const collection = new Collection({
    type: 'base',
    name: 'work_schedules',
    listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
    fields: [
      { name: 'company', type: 'relation', collectionId: companies.id, required: true, maxSelect: 1, cascadeDelete: true },
      { name: 'name', type: 'text', required: true, max: 120 },
      { name: 'effective_date', type: 'text', required: true, min: 10, max: 10, pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
      { name: 'description', type: 'text', max: 500 },
      { name: 'is_active', type: 'bool' },
      { name: 'days', type: 'json', maxSize: 20000 },
      { name: 'employees', type: 'relation', collectionId: employees.id, maxSelect: 2000, cascadeDelete: false },
      { name: 'owner', type: 'relation', collectionId: users.id, required: true, maxSelect: 1, cascadeDelete: true },
      { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
      { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
    ],
    indexes: ['CREATE INDEX idx_work_schedules_company_date ON work_schedules (company, effective_date)'],
  });
  app.save(collection);
}, (app) => {
  app.delete(app.findCollectionByNameOrId('work_schedules'));
});
