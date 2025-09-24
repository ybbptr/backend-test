const Employee = require('../model/employeeModel');

async function resolveActor(req, session) {
  const userId = req.user?.id || null;
  let name = req.user?.name || null;

  if (userId) {
    const q = Employee.findOne({ user: userId }).select('name');
    const emp = session ? await q.session(session) : await q;
    if (emp?.name) name = emp.name;
  }

  return {
    userId,
    name: name || 'system'
  };
}

module.exports = { resolveActor };
