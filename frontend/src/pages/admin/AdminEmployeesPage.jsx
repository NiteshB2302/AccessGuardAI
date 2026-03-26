import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Search, ShieldCheck, Trash2, Users, UserPlus, X } from "lucide-react";
import { createEmployee, deleteEmployeePermanently, fetchEmployees } from "../../services/dashboardService";

const EMPTY_FORM = {
  name: "",
  email: "",
  password: "",
  role: "Employee",
  department: "Engineering"
};

export default function AdminEmployeesPage() {
  const [employees, setEmployees] = useState([]);
  const [employeeForm, setEmployeeForm] = useState(EMPTY_FORM);
  const [formMessage, setFormMessage] = useState("");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [deleteModal, setDeleteModal] = useState({
    open: false,
    employee: null,
    pin: "",
    confirm: false,
    loading: false
  });

  const loadEmployees = async () => {
    const rows = await fetchEmployees();
    setEmployees(rows);
  };

  useEffect(() => {
    loadEmployees().catch(() => {});
  }, []);

  const handleCreateEmployee = async (event) => {
    event.preventDefault();
    setFormMessage("");
    try {
      const response = await createEmployee(employeeForm);
      setFormMessage(
        `Created ${response.employee.name} (${response.employee.employeeID}) - ${response.employee.role}`
      );
      setEmployeeForm(EMPTY_FORM);
      loadEmployees().catch(() => {});
    } catch (error) {
      setFormMessage(error?.response?.data?.message || "Unable to create employee.");
    }
  };

  const openDeleteModal = (employee) => {
    setDeleteModal({
      open: true,
      employee,
      pin: "",
      confirm: false,
      loading: false
    });
  };

  const closeDeleteModal = (force = false) => {
    if (deleteModal.loading && !force) return;
    setDeleteModal({
      open: false,
      employee: null,
      pin: "",
      confirm: false,
      loading: false
    });
  };

  const handleDeleteEmployee = async () => {
    if (!deleteModal.employee) return;
    if (!deleteModal.confirm) {
      setFormMessage("Please confirm permanent deletion before continuing.");
      return;
    }

    setDeleteModal((state) => ({ ...state, loading: true }));
    setFormMessage("");

    try {
      const response = await deleteEmployeePermanently(deleteModal.employee.employeeID, deleteModal.pin, true);
      setFormMessage(response.message || `${deleteModal.employee.employeeID} deleted permanently.`);
      closeDeleteModal(true);
      await loadEmployees();
    } catch (error) {
      setFormMessage(error?.response?.data?.message || "Unable to delete employee.");
      setDeleteModal((state) => ({ ...state, loading: false }));
    }
  };

  const filteredEmployees = useMemo(() => {
    return employees.filter((employee) => {
      const roleOk = roleFilter === "All" ? true : employee.role === roleFilter;
      const status = employee.accountStatus || "Active";
      const statusOk = statusFilter === "All" ? true : status === statusFilter;
      const query = search.trim().toLowerCase();
      const searchOk =
        !query ||
        employee.employeeID?.toLowerCase().includes(query) ||
        employee.name?.toLowerCase().includes(query) ||
        employee.email?.toLowerCase().includes(query) ||
        employee.department?.toLowerCase().includes(query);
      return roleOk && statusOk && searchOk;
    });
  }, [employees, roleFilter, search, statusFilter]);

  const stats = useMemo(() => {
    return {
      total: employees.length,
      admins: employees.filter((item) => item.role === "Admin").length,
      hrManagers: employees.filter((item) => item.role === "HR Manager").length,
      active: employees.filter((item) => (item.accountStatus || "Active") === "Active").length
    };
  }, [employees]);

  const roleTone = (role) => {
    if (role === "Admin") return "border-cyber-threat/40 bg-cyber-threat/10 text-cyber-threat";
    if (role === "HR Manager") return "border-cyber-warn/40 bg-cyber-warn/10 text-cyber-warn";
    return "border-cyber-safe/40 bg-cyber-safe/10 text-cyber-safe";
  };

  const statusTone = (status) => {
    return status === "Blocked"
      ? "border-cyber-threat/45 bg-cyber-threat/10 text-cyber-threat"
      : "border-cyber-safe/45 bg-cyber-safe/10 text-cyber-safe";
  };

  return (
    <div className="space-y-4">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="glass-panel rounded-2xl border border-cyber-accent/20 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-400">Total Users</p>
          <p className="mt-2 font-display text-2xl text-slate-900">{stats.total}</p>
        </div>
        <div className="glass-panel rounded-2xl border border-cyber-accent/20 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-400">Admin Accounts</p>
          <p className="mt-2 font-display text-2xl text-cyber-threat">{stats.admins}</p>
        </div>
        <div className="glass-panel rounded-2xl border border-cyber-accent/20 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-400">HR Managers</p>
          <p className="mt-2 font-display text-2xl text-cyber-warn">{stats.hrManagers}</p>
        </div>
        <div className="glass-panel rounded-2xl border border-cyber-accent/20 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-400">Active Accounts</p>
          <p className="mt-2 font-display text-2xl text-cyber-safe">{stats.active}</p>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[1fr,1.4fr]">
        <div className="glass-panel rounded-2xl border border-cyber-accent/20 p-5">
          <div className="mb-4 flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-cyber-accent" />
            <h3 className="font-display text-lg font-semibold text-slate-900">Create Employee</h3>
          </div>
          <form onSubmit={handleCreateEmployee} className="grid gap-2.5">
            <input
              required
              value={employeeForm.name}
              onChange={(e) => setEmployeeForm((s) => ({ ...s, name: e.target.value }))}
              className="rounded-xl border border-cyber-accent/20 bg-cyber-base/60 px-3 py-2 text-sm text-slate-100"
              placeholder="Name"
            />
            <input
              required
              type="email"
              value={employeeForm.email}
              onChange={(e) => setEmployeeForm((s) => ({ ...s, email: e.target.value }))}
              className="rounded-xl border border-cyber-accent/20 bg-cyber-base/60 px-3 py-2 text-sm text-slate-100"
              placeholder="Email"
            />
            <input
              required
              value={employeeForm.password}
              onChange={(e) => setEmployeeForm((s) => ({ ...s, password: e.target.value }))}
              className="rounded-xl border border-cyber-accent/20 bg-cyber-base/60 px-3 py-2 text-sm text-slate-100"
              placeholder="Password"
            />
            <div className="grid grid-cols-2 gap-2">
              <select
                value={employeeForm.role}
                onChange={(e) => setEmployeeForm((s) => ({ ...s, role: e.target.value }))}
                className="rounded-xl border border-cyber-accent/20 bg-cyber-base/60 px-3 py-2 text-sm text-slate-100"
              >
                <option>Employee</option>
                <option>HR Manager</option>
                <option>Admin</option>
              </select>
              <select
                value={employeeForm.department}
                onChange={(e) => setEmployeeForm((s) => ({ ...s, department: e.target.value }))}
                className="rounded-xl border border-cyber-accent/20 bg-cyber-base/60 px-3 py-2 text-sm text-slate-100"
              >
                <option>Engineering</option>
                <option>HR</option>
                <option>Finance</option>
                <option>Intern</option>
                <option>Product</option>
                <option>Operations</option>
                <option>Training</option>
              </select>
            </div>
            <button className="mt-1 rounded-xl bg-cyber-accent px-4 py-2 text-sm font-semibold text-cyber-base">
              Create Employee
            </button>
          </form>
          {formMessage && (
            <p className="mt-3 rounded-lg border border-cyber-accent/30 bg-cyber-accent/10 px-3 py-2 text-xs text-slate-200">
              {formMessage}
            </p>
          )}
        </div>

        <div className="glass-panel cyber-scroll rounded-2xl border border-cyber-accent/20 p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-cyber-safe" />
              <h3 className="font-display text-lg font-semibold text-slate-900">Employee Directory</h3>
            </div>
            <div className="rounded-full border border-cyber-accent/20 bg-cyber-base/45 px-3 py-1 text-xs text-slate-300">
              {filteredEmployees.length} records
            </div>
          </div>

          <div className="mb-3 grid gap-2 lg:grid-cols-[1.2fr,0.7fr,0.7fr]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cyber-accent/70" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by ID, name, email, department..."
                className="w-full rounded-xl border border-cyber-accent/20 bg-cyber-base/60 py-2 pl-9 pr-3 text-sm text-slate-100"
              />
            </div>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="rounded-xl border border-cyber-accent/20 bg-cyber-base/60 px-3 py-2 text-sm text-slate-100"
            >
              <option>All</option>
              <option>Admin</option>
              <option>HR Manager</option>
              <option>Employee</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-xl border border-cyber-accent/20 bg-cyber-base/60 px-3 py-2 text-sm text-slate-100"
            >
              <option>All</option>
              <option>Active</option>
              <option>Blocked</option>
            </select>
          </div>

          <div className="max-h-[440px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-cyber-base/90 text-left text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="pb-2">EmployeeID</th>
                  <th className="pb-2">Name</th>
                  <th className="pb-2">Role</th>
                  <th className="pb-2">Department</th>
                  <th className="pb-2">Status</th>
                  <th className="pb-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredEmployees.map((employee, index) => (
                  <motion.tr
                    key={employee._id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.015 }}
                    className="border-t border-cyber-accent/10"
                  >
                    <td className="py-2 font-mono text-cyber-accent">{employee.employeeID}</td>
                    <td className="py-2 text-slate-100">
                      <p>{employee.name}</p>
                      <p className="text-xs text-slate-400">{employee.email}</p>
                    </td>
                    <td className="py-2">
                      <span className={`rounded-full border px-2 py-0.5 text-xs ${roleTone(employee.role)}`}>
                        {employee.role}
                      </span>
                    </td>
                    <td className="py-2 text-slate-300">{employee.department}</td>
                    <td className="py-2">
                      <span className={`rounded-full border px-2 py-0.5 text-xs ${statusTone(employee.accountStatus || "Active")}`}>
                        <span className="inline-flex items-center gap-1">
                          <ShieldCheck className="h-3 w-3" />
                          {employee.accountStatus || "Active"}
                        </span>
                      </span>
                    </td>
                    <td className="py-2">
                      {employee.role === "Admin" ? (
                        <span className="rounded-full border border-cyber-accent/25 bg-cyber-base/60 px-2 py-0.5 text-xs text-slate-400">
                          Protected
                        </span>
                      ) : (
                        <button
                          onClick={() => openDeleteModal(employee)}
                          className="inline-flex items-center gap-1 rounded-lg border border-cyber-threat/35 bg-cyber-threat/10 px-2 py-1 text-xs text-cyber-threat transition hover:bg-cyber-threat/20"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete
                        </button>
                      )}
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
            {filteredEmployees.length === 0 && (
              <p className="py-6 text-center text-sm text-slate-400">No employees match your filters.</p>
            )}
          </div>
        </div>
      </div>

      {deleteModal.open && deleteModal.employee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-cyber-base/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-cyber-threat/40 bg-cyber-panel p-5 shadow-cyber">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h4 className="font-display text-lg font-semibold text-slate-900">Permanent Employee Deletion</h4>
                <p className="mt-1 text-sm text-slate-300">
                  This removes <span className="font-mono text-cyber-threat">{deleteModal.employee.employeeID}</span> and all
                  linked records (alerts, logs, activity, incidents, detections).
                </p>
              </div>
              <button
                onClick={closeDeleteModal}
                disabled={deleteModal.loading}
                className="rounded-lg border border-cyber-accent/25 bg-cyber-base/55 p-1.5 text-slate-300 disabled:opacity-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3">
              <label className="block text-xs uppercase tracking-wide text-slate-400">Security PIN</label>
              <input
                type="password"
                value={deleteModal.pin}
                onChange={(e) => setDeleteModal((state) => ({ ...state, pin: e.target.value }))}
                placeholder="Enter admin delete PIN"
                className="w-full rounded-xl border border-cyber-threat/35 bg-cyber-base/60 px-3 py-2 text-sm text-slate-100"
              />

              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={deleteModal.confirm}
                  onChange={(e) => setDeleteModal((state) => ({ ...state, confirm: e.target.checked }))}
                  className="h-4 w-4 rounded border-cyber-accent/35 bg-cyber-base/70"
                />
                I confirm permanent deletion of this employee and all related data.
              </label>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={closeDeleteModal}
                  disabled={deleteModal.loading}
                  className="rounded-xl border border-cyber-accent/25 bg-cyber-base/60 px-3 py-2 text-sm text-slate-200 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteEmployee}
                  disabled={deleteModal.loading || !deleteModal.pin || !deleteModal.confirm}
                  className="rounded-xl border border-cyber-threat/35 bg-cyber-threat/15 px-3 py-2 text-sm font-semibold text-cyber-threat disabled:opacity-50"
                >
                  {deleteModal.loading ? "Deleting..." : "Delete Permanently"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
