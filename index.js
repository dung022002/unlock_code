const express = require("express");
const hbs = require("express-handlebars");

const { Client } = require("pg");
const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
require("dotenv").config();
const port = process.env.APP_PORT;

app.engine(
  "hbs",
  hbs.engine({
    extname: ".hbs",
  })
);
app.set("views", "./views");
app.set("view engine", "hbs");

app.use("/css", express.static("css"));
app.use("/font", express.static("font"));
app.use("/images", express.static("images"));
app.use("/js", express.static("js"));

// keycloak database config
const keycloakConfig = {
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_KEYCLOAK,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
};

// mcbook_promotion_dev config
const promotionConfig = {
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_PROMOTION,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
};

// mcbook_courses_dev config
const courseConfig = {
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_COURSE,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
};

let err = false;
let msg = null;
app.get("/", (req, res) => {
  if (err) {
    res.render("enterCode", { msg: msg });
    err = false;
    msg = null;
    return;
  }
  res.render("enterCode", { msg: null });
});

app.post("/post", async (req, res) => {
  try {
    const email = req.body.email;
    const code = req.body.code;
    if (!email) {
      err = true;
      msg = "Email không được để trống";
      return res.redirect("/");
    }
    // Get userId from user_entity
    // Query to select data from the user_entity table
    const query1 = `SELECT DISTINCT id FROM user_entity WHERE email = \'${email}\'`;

    // Connect to the keycloak database
    const client1 = new Client(keycloakConfig);
    await client1.connect();

    // Fetch data from the user_entity table
    const result1 = await client1.query(query1);
    const data1 = result1.rows;

    // Disconnect from the keycloak database
    await client1.end();

    // USER_ID
    if (!data1[0]) {
      err = true;
      msg = "Email chưa được đăng kí";
      return res.redirect("/");
    }
    const userId = data1[0].id;

    // Get code from bonus_courses
    // Query to select/insert data from the bonus_courses table
    const query2a = `SELECT * FROM bonus_courses WHERE code = \'${code}\'`;
    const query2b = `UPDATE bonus_courses SET used_at = CURRENT_TIMESTAMP, used_by = \'${userId}\' WHERE code = \'${code}\'`;

    // Connect to the source database
    const Client2 = new Client(promotionConfig);
    await Client2.connect();

    // Fetch data from the source table
    const result2 = await Client2.query(query2a);
    const data2 = result2.rows;

    if (!data2[0]) {
      err = true;
      msg = "Mã khuyến mại không tồn tại";
      return res.redirect("/");
    }
    // Is code Usable?
    const promoCode = data2[0];
    let giftPromoId = "";
    if (promoCode.used_at && promoCode.used_by) {
      err = true;
      msg = "Mã này đã được sử dụng";
      return res.redirect("/");
    } else {
      giftPromoId = promoCode.gift_promotion_id;
    }
    await Client2.query(query2b);

    // Which courses does code applies to?
    // Query to select data from the gift_promotion_courses table
    const query3 = `SELECT DISTINCT courses_id FROM gift_promotion_courses WHERE gift_promotion_id = \'${giftPromoId}\'`;

    // Fetch data from the gift_promotion_courses table
    const result3 = await Client2.query(query3);
    const data3 = result3.rows;

    const arr = [];
    for (const iterator of data3) {
      arr.push(iterator.courses_id);
    }
    console.log(`courses id that code applies to: ${arr}`);
    // Disconnect from the mcbook_promotions_dev database
    await Client2.end();

    // Does user have those courses?
    const add = [];
    const exist = [];
    for (const iterator of arr) {
      const query4a = `SELECT * FROM courses_users WHERE user_id = \'${userId}\' AND course_id = \'${iterator}\'`;
      const query4b = `INSERT INTO courses_users (user_id, course_id, code, used_at, created_at, updated_at) VALUES (\'${userId}\', \'${iterator}\', \'${code}\', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`;

      // // Query to select/create data from the courses_users table
      // const query4a = `SELECT * FROM courses_users WHERE user_id = \'${userId}\' AND course_id = \'${iterator}\'`;
      // const query4b = `INSERT INTO courses_users (user_id, course_id, code, used_at, created_at, updated_at) VALUES (\'${userId}\', \'${iterator}\', \'${code}\', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`;
      // // Connect to the mcbook_courses_dev database
      const Client4 = new Client(courseConfig);
      await Client4.connect();
      // Fetch data from the courses_users table
      const result4 = await Client4.query(query4a);
      const data4 = result4.rows;
      console.log(data4);
      if (data4[0]) {
        exist.push(iterator);
        // msg = `Tài khoản ${email} đã sở hữu khóa học này, mã khóa học: ${iterator}.`;
        // return res.redirect("/");
      } else {
        await Client4.query(query4b);
        // Disconnect from the mcbook_courses_dev database
        await Client4.end();
        add.push(iterator);
        // err = true;
        // msg = `Tài khoản ${email} kích hoạt thành công mã khuyến mại, mã khóa học mới: ${iterator}.`;
        // return res.redirect("/");
      }
    }
    err = true;
    msg = `Tài khoản ${email} kích hoạt thành công mã khuyến mại, mã khóa học mới: ${add.toString()}.`;
    if (exist.length > 0) {
      msg = `Tài khoản ${email} kích hoạt thành công mã khuyến mại, mã khóa học mới: ${add.toString()}. Khóa học: ${exist.toString()} đã được kích hoạt từ trước đó.`;
      if (add.length == 0) {
        msg = `Tài khoản ${email} đã sở hữu khóa học này, mã khóa học: ${exist.toString()}.`;
      }
    }
    return res.redirect("/");
  } catch (error) {
    console.log(error);
  }
});

app.listen(port, () => {
  console.log(`App listening at http://localhost:${port}`);
});
