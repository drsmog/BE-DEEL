const express = require("express");
const bodyParser = require("body-parser");
const { Op } = require("sequelize");
const { sequelize } = require("./model");
const { getProfile } = require("./middleware/getProfile");
const {
  getContractById,
  getContractList,
  getUnpaidJobs,
  payForJob,
  depositOnBalance,
  aggregateBestProfession,
  aggregateBestClient,
} = require("./app.controller");
const app = express();
app.use(bodyParser.json());
app.set("sequelize", sequelize);
app.set("models", sequelize.models);

app.get("/contracts/:id", getProfile, getContractById);

app.get("/contracts", getProfile, getContractList);

app.get("/jobs/unpaid", getProfile, getUnpaidJobs);

app.post("/jobs/:job_id/pay", getProfile, payForJob);

app.post("/balances/deposit", getProfile, depositOnBalance);

app.get("/admin/best-profession", aggregateBestProfession);

app.get("/admin/best-clients", aggregateBestClient);

module.exports = app;
