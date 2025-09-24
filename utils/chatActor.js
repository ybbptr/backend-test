const throwError = require('../utils/throwError');
const Employee = require('../model/employeeModel');

async function resolveChatActor(req, session) {
  const userId = req.user?.id || null;
  const role = req.user?.role || null;
  let name = req.user?.name || null;

  if (!userId) throwError('Unauthorized', 401);

  if (role === 'karyawan') {
    const q = Employee.findOne({ user: userId }).select('name');
    const emp = session ? await q.session(session) : await q;
    if (!emp) throwError('Karyawan tidak ditemukan', 404);
    name = emp.name || name;
  }

  return {
    userId,
    name: name || 'system',
    role,
    isAdmin: role === 'admin',
    isEmployee: role === 'karyawan' || role === 'admin',
    isCustomer: role === 'user'
  };
}

module.exports = { resolveChatActor };
