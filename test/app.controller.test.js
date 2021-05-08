const assert = require("assert");
const sinon = require("sinon");
const proxyquire = require("proxyquire");
let controller;
let sequelizeMock = {};

describe("App controller", function () {
  beforeEach(() => {
    controller = proxyquire("../src/app.controller", {
      "./model": { sequelize: sequelizeMock },
    });
  });
  describe("fetch contracts", function () {
    let contract;
    let ContractInstance;
    let req;
    let res;
    beforeEach(() => {
      contract = { ContractorId: "contractorId", ClientId: "clientId" };
      ContractInstance = {
        findOne: sinon.stub().returns(contract),
        findAll: sinon.stub().returns([contract, contract]),
      };
      req = {
        params: { id: "contractId" },
        profile: { id: "userId" },
        app: { get: sinon.stub().returns({ Contract: ContractInstance }) },
      };
      res = { status: sinon.stub().returnsThis(), json: sinon.stub() };
    });
    it("should not return contract in case if its not belongs to requester", async function () {
      await controller.getContractById(req, res);
      sinon.assert.calledWith(res.status, 403);
    });
    it("should return contract in case if requester is contractor", async function () {
      req.profile.id = "contractorId";
      await controller.getContractById(req, res);
      sinon.assert.calledWith(res.json, contract);
    });
    it("should return contract in case if requester is client", async function () {
      req.profile.id = "clientId";
      await controller.getContractById(req, res);
      sinon.assert.calledWith(res.json, contract);
    });
    it("should return list of contracts", async function () {
      req.profile.id = "clientId";
      await controller.getContractList(req, res);
      sinon.assert.calledWith(res.json, [contract, contract]);
    });
  });
  describe("fetch jobs", function () {
    let ContractInstance;
    let req;
    let res;
    let jobList;
    let JobInstance;
    beforeEach(() => {
      jobList = [{ id: 1 }, { id: 2 }];
      ContractInstance = {};
      JobInstance = {
        findAll: sinon.stub().returns(jobList),
      };
      req = {
        params: { id: "contractId" },
        profile: { id: "userId" },
        app: {
          get: sinon
            .stub()
            .returns({ Contract: ContractInstance, Job: JobInstance }),
        },
      };
      res = { status: sinon.stub().returnsThis(), json: sinon.stub() };
    });
    it("should fetch all unpaid jobs which belongs to requester", async function () {
      await controller.getUnpaidJobs(req, res);
      sinon.assert.calledWith(res.json, jobList);
    });
  });

  describe("payment processing", function () {
    let ContractInstance;
    let JobInstance;
    let req;
    let res;
    let jobRecord;
    let contractorRecord;
    let clientRecord;
    beforeEach(() => {
      contractorRecord = { id: "contractorId", balance: 0, save: sinon.stub() };
      clientRecord = { id: "clientId", balance: 24, save: sinon.stub() };
      jobRecord = {
        id: "job_id",
        price: 12,
        Contract: {
          getContractor: sinon.stub().returns(contractorRecord),
          getClient: sinon.stub().returns(clientRecord),
        },
        save: sinon.stub(),
      };
      ContractInstance = {};
      JobInstance = {
        findOne: sinon.stub().returns(jobRecord),
        findAll: sinon.stub().returns([jobRecord]),
      };
      req = {
        params: { id: "contractId", job_id: "job_id" },
        profile: { id: "userId" },
        app: {
          get: sinon
            .stub()
            .returns({ Contract: ContractInstance, Job: JobInstance }),
        },
      };
      res = { status: sinon.stub().returnsThis(), json: sinon.stub() };
    });
    it("should call rollback in case of error or invalid data", async function () {
      const rollbackTransaction = sinon.stub();
      sequelizeMock.transaction = sinon
        .stub()
        .resolves({ rollback: rollbackTransaction });
      await controller.payForJob(req, res);
      sinon.assert.called(rollbackTransaction);
    });
    it("should transfer money from client to contractor", async function () {
      const rollbackTransaction = sinon.stub();
      const commitTransaction = sinon.stub();
      sequelizeMock.transaction = sinon
        .stub()
        .resolves({ rollback: rollbackTransaction, commit: commitTransaction });
      await controller.payForJob(req, res);
      sinon.assert.notCalled(rollbackTransaction);
      sinon.assert.called(commitTransaction);
      sinon.assert.calledWith(res.json, {
        client: { ...clientRecord, balance: 12 },
        contractor: { ...contractorRecord, balance: 12 },
        job: { ...jobRecord, paid: true },
      });
    });
    it("should return error if client dont have enough to pay for job", async function () {
      const rollbackTransaction = sinon.stub();
      const commitTransaction = sinon.stub();
      sequelizeMock.transaction = sinon
        .stub()
        .resolves({ rollback: rollbackTransaction, commit: commitTransaction });
      jobRecord.price = 100;
      await controller.payForJob(req, res);
      sinon.assert.notCalled(rollbackTransaction);
      sinon.assert.notCalled(commitTransaction);
      sinon.assert.calledWith(res.status, 400);
    });
    it("should deposit monay on balance", async function () {
      req.body = { amountToDeposit: 20 };
      jobRecord.sumprice = 200;
      jobRecord.get = sinon.stub().returns(200);
      const rollbackTransaction = sinon.stub();
      const commitTransaction = sinon.stub();
      sequelizeMock.transaction = sinon
        .stub()
        .resolves({ rollback: rollbackTransaction, commit: commitTransaction });
      sequelizeMock.col = sinon.stub();
      sequelizeMock.fn = sinon.stub();
      await controller.depositOnBalance(req, res);
      sinon.assert.notCalled(rollbackTransaction);
      sinon.assert.called(commitTransaction);
      sinon.assert.calledWith(res.json, { ...clientRecord, balance: 44 });
    });
    it("should throw error if user is trying to deposit more than 25% of jobs to pay", async function () {
      req.body = { amountToDeposit: 200 };
      jobRecord.sumprice = 200;
      jobRecord.get = sinon.stub().returns(200);
      const rollbackTransaction = sinon.stub();
      const commitTransaction = sinon.stub();
      sequelizeMock.transaction = sinon
        .stub()
        .resolves({ rollback: rollbackTransaction, commit: commitTransaction });
      sequelizeMock.col = sinon.stub();
      sequelizeMock.fn = sinon.stub();
      await controller.depositOnBalance(req, res);
      sinon.assert.notCalled(rollbackTransaction);
      sinon.assert.notCalled(commitTransaction);
      sinon.assert.calledWith(res.status, 400);
    });
  });
});
