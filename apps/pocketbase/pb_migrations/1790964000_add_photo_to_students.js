/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const students = app.findCollectionByNameOrId("students");
    if (!students.fields.getByName("photo")) {
      students.fields.add(
        new FileField({
          name: "photo",
          maxSelect: 1,
          maxSize: 5242880,
          mimeTypes: ["image/jpeg", "image/png", "image/webp"],
          thumbs: ["100x100"],
        }),
      );
      app.save(students);
    }
  },
  (app) => {
    const students = app.findCollectionByNameOrId("students");
    if (students.fields.getByName("photo")) {
      students.fields.removeByName("photo");
      app.save(students);
    }
  },
);
