const { Op } = require("sequelize");
const { sequelize } = require("./model");

const getContractById = async (req, res) => {
  const { Contract } = req.app.get("models");
  const { id } = req.params;
  const contract = await Contract.findOne({ where: { id } });
  if (!contract) return res.status(404).end();
  if (
    contract.ContractorId !== req.profile.id &&
    contract.ClientId !== req.profile.id
  ) {
    return res
      .status(403)
      .json({ message: "dont have a permission to access this contract" });
  }
  res.json(contract);
};

const getContractList = async (req, res) => {
  const { Contract } = req.app.get("models");
  const { id: profileId } = req.profile;
  const contracts = await Contract.findAll({
    where: { [Op.or]: [{ ContractorId: profileId }, { ClientId: profileId }] },
  });
  res.json(contracts);
};

const getUnpaidJobs = async (req, res) => {
  const { Contract, Job } = req.app.get("models");
  const { id: profileId } = req.profile;
  const jobs = await Job.findAll({
    where: { paid: null },
    include: [
      {
        model: Contract,
        where: {
          status: "in_progress",
          [Op.or]: [{ ContractorId: profileId }, { ClientId: profileId }],
        },
      },
    ],
  });
  res.json(jobs);
};

const payForJob = async (req, res) => {
  const { Contract, Job } = req.app.get("models");
  const { job_id: jobId } = req.params;
  const job = await Job.findOne({ where: { id: jobId }, include: [Contract] });
  const contractor = await job.Contract.getContractor();
  const client = await job.Contract.getClient();
  const amountToPay = job.price;
  if (client.balance < amountToPay) {
    return res
      .status(400)
      .json({ message: "you dont have enough money to pay for this job" });
  }
  const t = await sequelize.transaction();
  try {
    client.balance -= amountToPay;
    contractor.balance += amountToPay;
    job.paid = true;
    await job.save();
    await client.save();
    await contractor.save();
    await t.commit();
  } catch (err) {
    console.log(err);
    t.rollback();
  }
  res.json({ client, contractor, job });
};

const depositOnBalance = async (req, res) => {
  const { Contract, Job } = req.app.get("models");
  const { id: profileId } = req.profile;
  const { amountToDeposit } = req.body;
  const jobs = await Job.findAll({
    attributes: {
      include: [[sequelize.fn("SUM", sequelize.col("price")), "sumprice"]],
    },
    where: { paid: null },
    include: [
      {
        model: Contract,
        where: {
          status: "in_progress",
          ClientId: profileId,
        },
      },
    ],
    group: [sequelize.col("Contract.ClientId")],
  });
  const record = jobs[0];
  const totalAmountToPayForJobs = record.get("sumprice");
  if (totalAmountToPayForJobs / 4 < amountToDeposit) {
    return res
      .status(400)
      .json(
        "too much to deposit on one time pls split it in several transactions"
      );
  }
  const client = await record.Contract.getClient();
  const t = await sequelize.transaction();
  try {
    client.balance += amountToDeposit;
    await client.save();
    await t.commit();
  } catch (err) {
    console.log(err);
    t.rollback();
  }
  res.json(client);
};

const aggregateBestProfession = async (req, res) => {
  const { start, end } = req.query;
  const { Contract, Job, Profile } = req.app.get("models");
  const jobs = await Job.findAll({
    attributes: {
      include: [[sequelize.fn("MAX", sequelize.col("price")), "maxprice"]],
    },
    where: {
      createdAt: {
        [Op.gte]: new Date(start),
        [Op.lte]: new Date(end),
      },
      paid: true,
    },
    include: [{ model: Contract, include: ["Contractor"] }],
    group: [sequelize.col("Contract.Contractor.profession")],
    order: [[sequelize.col("maxprice"), "DESC"]],
    limit: 1,
  });
  const record = jobs[0];
  const maxprice = record.get("maxprice");
  res.json({
    profession: record.Contract.Contractor.profession,
    amount: maxprice,
  });
};

const aggregateBestClient = async (req, res) => {
  const { start, end, limit } = req.query;
  const { Contract, Job } = req.app.get("models");
  const jobs = await Job.findAll({
    attributes: {
      include: [[sequelize.fn("SUM", sequelize.col("price")), "sumpaid"]],
    },
    where: {
      createdAt: {
        [Op.gte]: new Date(start),
        [Op.lte]: new Date(end),
      },
      paid: true,
    },
    include: [{ model: Contract, include: ["Client"] }],
    group: [sequelize.col("Contract.ClientId")],
    order: [[sequelize.col("sumpaid"), "DESC"]],
    limit: Number(limit),
  });
  const clients = jobs.map((j) => ({
    paid: j.get("sumpaid"),
    id: j.id,
    fullName: `${j.Contract.Client.firstName} ${j.Contract.Client.lastName}`,
  }));
  res.json(clients);
};

module.exports = {
  getContractById,
  getContractList,
  getUnpaidJobs,
  payForJob,
  depositOnBalance,
  aggregateBestProfession,
  aggregateBestClient,
};
