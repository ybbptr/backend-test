const mongoose = require('mongoose');
const Employee = require('../model/employeeModel');
const User = require('../model/userModel');
const throwError = require('../utils/throwError');

async function resolveActor(req, session) {
  const userId = req.user?.id || req.user?._id || null;
  const role = req.user?.role || null;
  let name = req.user?.name || null;

  if (!userId) {
    return throwError('Tidak punya akses, silahkan login ulang');
  }

  // Kalau karyawan → cari Employee
  if (role === 'karyawan') {
    const q = Employee.findOne({ user: userId }).select('name');
    const emp = session ? await q.session(session) : await q;
    if (emp?.name) name = emp.name;
    return {
      model: 'Employee',
      id: new mongoose.Types.ObjectId(String(emp?._id || userId)),
      name: name || 'Karyawan'
    };
  }

  // Kalau admin / user biasa → ambil dari User
  if (role === 'admin') {
    const q = User.findById(userId).select('name');
    const usr = session ? await q.session(session) : await q;
    if (usr?.name) name = usr.name;
    return {
      model: 'User',
      id: new mongoose.Types.ObjectId(String(usr?._id || userId)),
      name: name || 'User'
    };
  }

  // fallback
  return {
    model: 'User',
    userId: new mongoose.Types.ObjectId(String(userId)),
    name
  };
}

module.exports = { resolveActor };
