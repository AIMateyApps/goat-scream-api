#!/usr/bin/env node
require('dotenv').config();
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
// crypto is a built-in global in Node.js 20+
const mongoose = require('mongoose');
const ApiKey = require('../src/models/ApiKey');
const KeyRequest = require('../src/models/KeyRequest');

const argv = yargs(hideBin(process.argv))
  .command('create', 'Create a new API key', y =>
    y
      .option('label', { type: 'string', demandOption: true })
      .option('tier', { type: 'string', default: 'basic', choices: ['public', 'basic', 'pro'] })
      .option('quota', { type: 'number', default: 100 })
  )
  .command('list', 'List API keys')
  .command('disable', 'Disable an API key', y =>
    y.option('key', { type: 'string', demandOption: true })
  )
  .command('request:list', 'List API key requests', y =>
    y.option('status', {
      type: 'string',
      default: 'pending',
      choices: ['pending', 'approved', 'rejected', 'all'],
    })
  )
  .command('request:approve', 'Approve a key request and issue an API key', y =>
    y
      .option('id', { type: 'string', demandOption: true })
      .option('tier', { type: 'string', default: 'basic', choices: ['basic', 'pro'] })
      .option('quota', { type: 'number' })
  )
  .demandCommand(1)
  .help().argv;

(async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI not set');
    process.exit(1);
  }
  await mongoose.connect(uri);

  const [command] = argv._;
  const tierDefaults = { public: Number(process.env.RATE_LIMIT_MAX || 100), basic: 200, pro: 600 };

  try {
    if (command === 'create') {
      const key = `gsa_${crypto.randomUUID().replace(/-/g, '')}`;
      const quota = argv.quota || tierDefaults[argv.tier] || tierDefaults.basic;
      const doc = await ApiKey.create({
        key,
        label: argv.label,
        tier: argv.tier,
        quota_per_minute: quota,
      });
      console.log('Created API key:', doc.key);
    } else if (command === 'list') {
      const keys = await ApiKey.find().lean();
      console.table(
        keys.map(({ key, label, tier, quota_per_minute, status, createdAt }) => ({
          key,
          label,
          tier,
          quota_per_minute,
          status,
          createdAt,
        }))
      );
    } else if (command === 'disable') {
      const result = await ApiKey.findOneAndUpdate(
        { key: argv.key },
        { status: 'disabled' },
        { new: true }
      );
      if (!result) console.error('Key not found');
      else console.log('Disabled key:', result.key);
    } else if (command === 'request:list') {
      const filter = argv.status === 'all' ? {} : { status: argv.status };
      const requests = await KeyRequest.find(filter).sort({ createdAt: -1 }).lean();
      if (!requests.length) console.log('No requests found');
      else
        console.table(
          requests.map(({ _id, name, email, intended_use, status, createdAt }) => ({
            id: _id.toString(),
            name,
            email,
            intended_use,
            status,
            createdAt,
          }))
        );
    } else if (command === 'request:approve') {
      const request = await KeyRequest.findById(argv.id);
      if (!request) {
        console.error('Request not found');
      } else if (request.status === 'approved') {
        console.error('Request already approved');
      } else {
        const quota = argv.quota || tierDefaults[argv.tier] || tierDefaults.basic;
        const key = `gsa_${crypto.randomUUID().replace(/-/g, '')}`;
        await ApiKey.create({
          key,
          label: `${request.name} (${request.email})`,
          tier: argv.tier,
          quota_per_minute: quota,
        });
        request.status = 'approved';
        request.notes = `API key ${key} issued ${new Date().toISOString()}`;
        await request.save();
        console.log('Approved request and issued key:', key);
      }
    }
  } catch (err) {
    console.error(err.message);
  } finally {
    await mongoose.disconnect();
  }
})();
