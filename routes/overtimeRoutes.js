const express = require("express");
const authMiddleware = require("../middleware/auth");

module.exports = function (prisma) {
  const router = express.Router();

  // Constants
  const BONUS_PER_HOUR = 50000; // Rp 50.000 per jam
  const MIN_OVERTIME_MINUTES = 30; // Minimal 30 menit baru dihitung overtime

  /**
   * Helper: Hitung durasi overtime dalam jam
   */
  function calculateOvertimeHours(scheduledEnd, actualCheckout) {
    const [schedHour, schedMin] = scheduledEnd.split(":").map(Number);
    const [actualHour, actualMin] = actualCheckout.split(":").map(Number);

    const schedMinutes = schedHour * 60 + schedMin;
    const actualMinutes = actualHour * 60 + actualMin;

    const diffMinutes = actualMinutes - schedMinutes;

    if (diffMinutes < MIN_OVERTIME_MINUTES) {
      return 0;
    }

    // Convert to hours (decimal)
    return (diffMinutes / 60).toFixed(2);
  }

  /**
   * Helper: Calculate bonus
   */
  function calculateBonus(overtimeHours) {
    return parseFloat(overtimeHours) * BONUS_PER_HOUR;
  }

  // ✅ GET all overtime records (Admin/HR)
  router.get(
    "/",
    authMiddleware.authenticateToken,
    authMiddleware.authorizeRole(["Admin", "HR"]),
    async (req, res) => {
      try {
        const { status, month, year, employee_id } = req.query;

        const where = {};
        if (status) where.status = status;
        if (employee_id) where.employee_id = parseInt(employee_id);

        if (month && year) {
          where.tanggal = {
            gte: new Date(year, month - 1, 1),
            lt: new Date(year, month, 1),
          };
        }

        const overtimeList = await prisma.overtime.findMany({
          where,
          include: {
            employee: {
              select: {
                employee_id: true,
                nama_lengkap: true,
                jabatan: true,
              },
            },
            approver: {
              select: {
                user_id: true,
                username: true,
              },
            },
            attendance: {
              select: {
                attendance_id: true,
                jam_masuk: true,
                lokasi_pulang: true,
              },
            },
          },
          orderBy: {
            created_at: "desc",
          },
        });

        console.log(`📊 Fetched ${overtimeList.length} overtime records`);
        res.json(overtimeList);
      } catch (error) {
        console.error("❌ Error fetching overtime:", error);
        res.status(500).json({
          error: "Gagal mengambil data overtime",
          details: error.message,
        });
      }
    }
  );

  // ✅ GET overtime by employee (Karyawan only see their own)
  router.get(
    "/employee/:employee_id",
    authMiddleware.authenticateToken,
    async (req, res) => {
      try {
        const { employee_id } = req.params;
        const { role, employee_id: userEmployeeId } = req.user;
        const { month, year } = req.query;

        // Karyawan only can see their own
        if (role === "Karyawan" && parseInt(employee_id) !== userEmployeeId) {
          return res.status(403).json({
            error: "Anda hanya dapat melihat overtime diri sendiri",
          });
        }

        const where = { employee_id: parseInt(employee_id) };

        if (month && year) {
          where.tanggal = {
            gte: new Date(year, month - 1, 1),
            lt: new Date(year, month, 1),
          };
        }

        const overtimeList = await prisma.overtime.findMany({
          where,
          include: {
            approver: {
              select: {
                username: true,
              },
            },
            attendance: {
              select: {
                jam_masuk: true,
                jam_pulang: true,
              },
            },
          },
          orderBy: {
            tanggal: "desc",
          },
        });

        // Calculate summary
        const summary = {
          total_hours: 0,
          total_bonus: 0,
          pending: 0,
          approved: 0,
          rejected: 0,
        };

        overtimeList.forEach((ot) => {
          if (ot.status === "approved") {
            summary.total_hours += parseFloat(ot.overtime_hours);
            summary.total_bonus += parseFloat(ot.total_bonus);
          }
          summary[ot.status]++;
        });

        res.json({
          records: overtimeList,
          summary,
        });
      } catch (error) {
        console.error("❌ Error fetching employee overtime:", error);
        res.status(500).json({
          error: "Gagal mengambil data overtime karyawan",
          details: error.message,
        });
      }
    }
  );

  // ✅ POST approve/reject overtime (Admin/HR only)
  router.post(
    "/approve/:overtime_id",
    authMiddleware.authenticateToken,
    authMiddleware.authorizeRole(["Admin", "HR"]),
    async (req, res) => {
      try {
        const { overtime_id } = req.params;
        const { action, notes } = req.body;
        const adminId = req.user.user_id;

        if (!["approve", "reject"].includes(action)) {
          return res.status(400).json({
            error: "Action harus 'approve' atau 'reject'",
          });
        }

        const overtime = await prisma.overtime.findUnique({
          where: { overtime_id: parseInt(overtime_id) },
          include: {
            employee: {
              select: {
                nama_lengkap: true,
              },
            },
          },
        });

        if (!overtime) {
          return res.status(404).json({
            error: "Overtime tidak ditemukan",
          });
        }

        if (overtime.status !== "pending") {
          return res.status(400).json({
            error: `Overtime ini sudah ${overtime.status}`,
          });
        }

        const updated = await prisma.overtime.update({
          where: { overtime_id: parseInt(overtime_id) },
          data: {
            status: action === "approve" ? "approved" : "rejected",
            approved_by: adminId,
            approval_notes: notes || null,
            approval_date: new Date(),
          },
        });

        const message =
          action === "approve"
            ? `✅ Overtime dari ${overtime.employee.nama_lengkap} telah disetujui`
            : `❌ Overtime dari ${overtime.employee.nama_lengkap} ditolak`;

        console.log(message);
        res.json({
          message,
          data: updated,
        });
      } catch (error) {
        console.error("❌ Error approving overtime:", error);
        res.status(500).json({
          error: "Gagal memproses approval overtime",
          details: error.message,
        });
      }
    }
  );

  // ✅ GET pending overtime approvals (Admin/HR only)
  router.get(
    "/pending",
    authMiddleware.authenticateToken,
    authMiddleware.authorizeRole(["Admin", "HR"]),
    async (req, res) => {
      try {
        const pendingList = await prisma.overtime.findMany({
          where: {
            status: "pending",
          },
          include: {
            employee: {
              select: {
                employee_id: true,
                nama_lengkap: true,
                jabatan: true,
              },
            },
            attendance: {
              select: {
                jam_masuk: true,
                jam_pulang: true,
              },
            },
          },
          orderBy: {
            created_at: "desc",
          },
        });

        res.json(pendingList);
      } catch (error) {
        console.error("❌ Error fetching pending overtime:", error);
        res.status(500).json({
          error: "Gagal mengambil pending overtime",
          details: error.message,
        });
      }
    }
  );

  // ✅ GET overtime statistics (Admin/HR only)
  router.get(
    "/stats",
    authMiddleware.authenticateToken,
    authMiddleware.authorizeRole(["Admin", "HR"]),
    async (req, res) => {
      try {
        const { month, year } = req.query;
        const currentMonth = month || new Date().getMonth() + 1;
        const currentYear = year || new Date().getFullYear();

        const startDate = new Date(currentYear, currentMonth - 1, 1);
        const endDate = new Date(currentYear, currentMonth, 1);

        const overtimeList = await prisma.overtime.findMany({
          where: {
            tanggal: {
              gte: startDate,
              lt: endDate,
            },
          },
          include: {
            employee: {
              select: {
                nama_lengkap: true,
                jabatan: true,
              },
            },
          },
        });

        const stats = {
          total_records: overtimeList.length,
          pending: overtimeList.filter((o) => o.status === "pending").length,
          approved: overtimeList.filter((o) => o.status === "approved").length,
          rejected: overtimeList.filter((o) => o.status === "rejected").length,
          total_hours: 0,
          total_bonus: 0,
          by_employee: {},
        };

        overtimeList.forEach((ot) => {
          if (ot.status === "approved") {
            stats.total_hours += parseFloat(ot.overtime_hours);
            stats.total_bonus += parseFloat(ot.total_bonus);

            const empId = ot.employee_id;
            if (!stats.by_employee[empId]) {
              stats.by_employee[empId] = {
                employee_id: empId,
                nama_lengkap: ot.employee.nama_lengkap,
                jabatan: ot.employee.jabatan,
                total_hours: 0,
                total_bonus: 0,
                count: 0,
              };
            }

            stats.by_employee[empId].total_hours += parseFloat(
              ot.overtime_hours
            );
            stats.by_employee[empId].total_bonus += parseFloat(ot.total_bonus);
            stats.by_employee[empId].count++;
          }
        });

        stats.by_employee = Object.values(stats.by_employee);

        res.json(stats);
      } catch (error) {
        console.error("❌ Error fetching overtime stats:", error);
        res.status(500).json({
          error: "Gagal mengambil statistik overtime",
          details: error.message,
        });
      }
    }
  );

  // ✅ DELETE overtime record (Admin only)
  router.delete(
    "/:overtime_id",
    authMiddleware.authenticateToken,
    authMiddleware.authorizeRole(["Admin"]),
    async (req, res) => {
      try {
        const { overtime_id } = req.params;

        const overtime = await prisma.overtime.findUnique({
          where: { overtime_id: parseInt(overtime_id) },
        });

        if (!overtime) {
          return res.status(404).json({
            error: "Overtime tidak ditemukan",
          });
        }

        await prisma.overtime.delete({
          where: { overtime_id: parseInt(overtime_id) },
        });

        console.log(`✅ Overtime deleted: ID ${overtime_id}`);
        res.json({
          message: "Overtime berhasil dihapus",
        });
      } catch (error) {
        console.error("❌ Error deleting overtime:", error);
        res.status(500).json({
          error: "Gagal menghapus overtime",
          details: error.message,
        });
      }
    }
  );

  return router;
};
