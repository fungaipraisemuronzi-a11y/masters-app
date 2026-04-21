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

/* ---------------- LOGIN ---------------- */
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

/* ---------------- HOME ---------------- */
app.get("/home", requireLogin, async (req, res) => {
  const periods = (await db.query("SELECT * FROM periods")).rows;
  res.render("home", { periods });
});

/* ---------------- STUDENTS ---------------- */
app.get("/add-student", requireLogin, async (req, res) => {
  const students = (await db.query("SELECT * FROM students ORDER BY name")).rows;

  const totalResult = await db.query("SELECT COUNT(*) FROM students");
  const total = totalResult.rows[0].count;

  res.render("add-student", { students, total });
});

app.post("/add-student", requireLogin, async (req, res) => {
  const { name } = req.body;

  await db.query("INSERT INTO students (name) VALUES ($1)", [name]);

  res.redirect("/home");
});

/* ---------------- PERIOD ---------------- */
app.get("/period/:id", requireLogin, async (req, res) => {
  const periodId = req.params.id;

  const period = (await db.query(
    "SELECT * FROM periods WHERE id=$1",
    [periodId]
  )).rows[0];

  const students = (await db.query(`
    SELECT 
      students.id,
      students.name,
      COALESCE(SUM(payments.amount),0) as total
    FROM students
    LEFT JOIN payments 
      ON students.id = payments.student_id 
      AND payments.period_id = $1
    GROUP BY students.id, students.name
  `, [periodId])).rows;

  res.render("period-details", { period, students });
});

/* ---------------- ADD PERIOD ---------------- */
app.get("/add-period", requireLogin, (req, res) => {
  res.render("add-period");
});

app.post("/add-period", requireLogin, async (req, res) => {
  const { name, target } = req.body;

  await db.query(
    "INSERT INTO periods (name, target) VALUES ($1, $2)",
    [name, target]
  );

  res.redirect("/home");
});

/* ---------------- PAYMENT ---------------- */
app.post("/payment", requireLogin, async (req, res) => {
  const { student_id, period_id, amount } = req.body;

  const date = new Date().toISOString().split("T")[0];

  await db.query(
    "INSERT INTO payments (student_id, period_id, amount, date) VALUES ($1,$2,$3,$4)",
    [student_id, period_id, amount, date]
  );

  res.redirect(`/period/${period_id}`);
});

/* ---------------- DELETE STUDENT ---------------- */
app.get("/delete-student/:id/:periodId", requireLogin, async (req, res) => {
  const { id, periodId } = req.params;

  await db.query("DELETE FROM students WHERE id=$1", [id]);

  res.redirect(`/period/${periodId}`);
});

/* ---------------- CREDIT ---------------- */
app.get("/credit/:periodId", requireLogin, async (req, res) => {
  const periodId = req.params.periodId;

  const period = (await db.query("SELECT * FROM periods WHERE id=$1", [periodId])).rows[0];

  const students = (await db.query(`
  SELECT 
    students.id,
    students.name,
    COALESCE(SUM(payments.amount),0) as total
  FROM students
  LEFT JOIN payments 
    ON students.id = payments.student_id 
    AND payments.period_id = $1
  GROUP BY students.id, students.name
  HAVING COALESCE(SUM(payments.amount),0) < $2
`, [periodId, period.target])).rows;

  res.render("credit", { students, period });
});

/* ---------------- ADVANCE ---------------- */
app.get("/advance/:periodId", requireLogin, async (req, res) => {
  const periodId = req.params.periodId;

  const period = (await db.query("SELECT * FROM periods WHERE id=$1", [periodId])).rows[0];

  const students = (await db.query(`
  SELECT 
    students.id,
    students.name,
    COALESCE(SUM(payments.amount),0) as total
  FROM students
  LEFT JOIN payments 
    ON students.id = payments.student_id 
    AND payments.period_id = $1
  GROUP BY students.id, students.name
  HAVING COALESCE(SUM(payments.amount),0) > $2
`, [periodId, period.target])).rows;

  res.render("advance", { students, period });
});

/* ---------------- STUDENT DETAILS ---------------- */
app.get("/student/:studentId/:periodId", requireLogin, async (req, res) => {
  const { studentId, periodId } = req.params;

  const student = (await db.query("SELECT * FROM students WHERE id=$1", [studentId])).rows[0];
  const period = (await db.query("SELECT * FROM periods WHERE id=$1", [periodId])).rows[0];

  const payments = (await db.query(`
    SELECT * FROM payments
    WHERE student_id=$1 AND period_id=$2
    ORDER BY date DESC
  `, [studentId, periodId])).rows;

  res.render("student-details", { student, period, payments });
});

/* ---------------- EDIT PAYMENT ---------------- */
app.get("/edit-payment/:id", requireLogin, async (req, res) => {
  const payment = (await db.query("SELECT * FROM payments WHERE id=$1", [req.params.id])).rows[0];
  res.render("edit-payment", { payment });
});

app.post("/edit-payment/:id", requireLogin, async (req, res) => {
  const { amount } = req.body;

  const payment = (await db.query("SELECT * FROM payments WHERE id=$1", [req.params.id])).rows[0];

  await db.query("UPDATE payments SET amount=$1 WHERE id=$2", [amount, req.params.id]);

  res.redirect(`/student/${payment.student_id}/${payment.period_id}`);
});

/* ---------------- EDIT PERIOD ---------------- */
app.get("/edit-period/:id", requireLogin, async (req, res) => {
  const period = (await db.query("SELECT * FROM periods WHERE id=$1", [req.params.id])).rows[0];
  res.render("edit-period", { period });
});

app.post("/edit-period/:id", requireLogin, async (req, res) => {
  const { name, target } = req.body;

  await db.query(
    "UPDATE periods SET name=$1, target=$2 WHERE id=$3",
    [name, target, req.params.id]
  );

  res.redirect(`/period/${req.params.id}`);
});

/* ---------------- LOGIN CHECK ---------------- */
function requireLogin(req, res, next) {
  if (!req.session.loggedIn) {
    return res.redirect("/login");
  }
  next();
}

/* ---------------- START SERVER ---------------- */
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log("Server running");
});