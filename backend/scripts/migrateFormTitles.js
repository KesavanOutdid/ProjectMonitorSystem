const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

async function run() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/project_monitor';
  await mongoose.connect(uri);
  console.log('Connected to MongoDB');

  const Form = mongoose.model('Form', new mongoose.Schema({}, { strict: false }));
  
  const r1 = await Form.updateMany(
    { title: { $regex: /^(request to work|request to work on task)$/i } },
    { $set: { title: 'Dependency Request', description: 'Request assignment or cross-team collaboration to resolve a task dependency. Routes to Team Lead for review and approval.' } }
  );
  console.log('Updated Request to Work forms:', r1.modifiedCount);

  const r2 = await Form.updateMany(
    { title: { $regex: /^(request help|request help on task)$/i } },
    { $set: { title: 'Task Assistance', description: 'Request guidance, pair programming, or unblocking from your Team Lead on a task you are currently working on.' } }
  );
  console.log('Updated Request Help forms:', r2.modifiedCount);

  const allForms = await Form.find({}).lean();
  console.log('Current Forms in DB:', allForms.map(f => f.title));
  await mongoose.disconnect();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
