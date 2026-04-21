const express = require("express");
const session = require("express-session");
const path = require("path");

const app = express();
const db = require("./database");

app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

app.use(
  session({
    secret: "secret-key",
    resave: false,
    saveUninitialized: true,
  })
);

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.get("/", (req, res) => {
  res.redirect("/login");
});

const PASSWORD = "admin321";

app.get("/login", (req, res) => {
  res.render("login");
});

app.post("/login", (req, res) => {
  const { password } = req.body;

  if (password === PASSWORD) {
    req.session.loggedIn = true;
    res.redirect("/home");
  } else {
    res.send("Wrong password");
  }
});

app.get("/home", requireLogin, (req, res) => {
  const periods = db.prepare("SELECT * FROM periods").all();
  res.render("home", { periods });
});

app.get("/add-student", requireLogin, (req, res) => {
  const students = db.prepare("SELECT * FROM students ORDER BY name").all();

  const total = db
    .prepare("SELECT COUNT(*) as count FROM students")
    .get()
    .count;

  res.render("add-student", { students, total });
});

app.post("/add-student", requireLogin, (req, res) => {
  const { name } = req.body;

  db.prepare("INSERT INTO students (name) VALUES (?)")
    .run(name);

  res.redirect("/home");
});

app.get("/period/:id", requireLogin, (req, res) => {
  const periodId = req.params.id;

  const period = db
    .prepare("SELECT * FROM periods WHERE id = ?")
    .get(periodId);

  const students = db.prepare(`
    SELECT 
      students.*,
      IFNULL(SUM(payments.amount), 0) as total
    FROM students
    LEFT JOIN payments 
      ON students.id = payments.student_id 
      AND payments.period_id = ?
    GROUP BY students.id
  `).all(periodId);

  res.render("period-details", { period, students });
});

app.get("/add-period", requireLogin, (req, res) => {
  res.render("add-period");
});

app.post("/add-period", requireLogin, (req, res) => {
  const { name, target } = req.body;

  db.prepare(`
    INSERT INTO periods (name, target)
    VALUES (?, ?)
  `).run(name, target);

  res.redirect("/home");
});

app.post("/payment", requireLogin, (req, res) => {
  const { student_id, period_id, amount } = req.body;

  const date = new Date().toISOString().split("T")[0];

  db.prepare(`
    INSERT INTO payments (student_id, period_id, amount, date)
    VALUES (?, ?, ?, ?)
  `).run(student_id, period_id, amount, date);

  res.redirect(`/period/${period_id}`);
});

app.get("/delete-student/:id", requireLogin, (req, res) => {
  const id = req.params.id;

  db.prepare("DELETE FROM students WHERE id = ?").run(id);

  res.redirect("javascript:history.back()"); // ❌ still not best
});

app.get("/credit/:periodId", requireLogin, (req, res) => {
  const periodId = req.params.periodId;

  const period = db
    .prepare("SELECT * FROM periods WHERE id = ?")
    .get(periodId);

  const students = db.prepare(`
    SELECT 
      students.*,
      IFNULL(SUM(payments.amount), 0) as total
    FROM students
    LEFT JOIN payments 
      ON students.id = payments.student_id 
      AND payments.period_id = ?
    GROUP BY students.id
    HAVING total < ?
  `).all(periodId, period.target);

  res.render("credit", { students, period });
});

app.get("/advance/:periodId", requireLogin, (req, res) => {
  const periodId = req.params.periodId;

  const period = db
    .prepare("SELECT * FROM periods WHERE id = ?")
    .get(periodId);

  const students = db.prepare(`
    SELECT 
      students.*,
      IFNULL(SUM(payments.amount), 0) as total
    FROM students
    LEFT JOIN payments 
      ON students.id = payments.student_id 
      AND payments.period_id = ?
    GROUP BY students.id
    HAVING total > ?
  `).all(periodId, period.target);

  res.render("advance", { students, period });
});

app.get("/student/:studentId/:periodId", requireLogin, (req, res) => {
  const { studentId, periodId } = req.params;

  const student = db
    .prepare("SELECT * FROM students WHERE id = ?")
    .get(studentId);

  const period = db
    .prepare("SELECT * FROM periods WHERE id = ?")
    .get(periodId);

  const payments = db.prepare(`
    SELECT * FROM payments
    WHERE student_id = ? AND period_id = ?
    ORDER BY date DESC
  `).all(studentId, periodId);

  res.render("student-details", {
    student,
    period,
    payments
  });
});

app.get("/edit-payment/:id", requireLogin, (req, res) => {
  const payment = db
    .prepare("SELECT * FROM payments WHERE id = ?")
    .get(req.params.id);

  res.render("edit-payment", { payment });
});

app.post("/edit-payment/:id", requireLogin, (req, res) => {
  const { amount } = req.body;

  const payment = db
    .prepare("SELECT * FROM payments WHERE id = ?")
    .get(req.params.id);

  db.prepare(`
    UPDATE payments
    SET amount = ?
    WHERE id = ?
  `).run(amount, req.params.id);

  res.redirect(`/student/${payment.student_id}/${payment.period_id}`);
});

app.get("/edit-period/:id", requireLogin, (req, res) => {
  const period = db
    .prepare("SELECT * FROM periods WHERE id = ?")
    .get(req.params.id);

  res.render("edit-period", { period });
});

app.post("/edit-period/:id", requireLogin, (req, res) => {
  const { name, target } = req.body;

  db.prepare(`
    UPDATE periods
    SET name = ?, target = ?
    WHERE id = ?
  `).run(name, target, req.params.id);

  res.redirect(`/period/${req.params.id}`);
});

function requireLogin(req, res, next) {
  if (!req.session.loggedIn) {
    return res.redirect("/login");
  }
  next();
}

app.listen(5000, () => {
  console.log("Server running on http://localhost:5000");
});