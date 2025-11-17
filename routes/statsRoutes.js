const express = require("express");
const { authenticateToken, authorizeRole } = require("../middleware/auth");

module.exports = function (prisma) {
  const router = express.Router();

  // Endpoint untuk Dashboard Stats (Hanya Admin/HR)
  router.get(
    "/dashboard",
    authenticateToken,
    authorizeRole(["Admin", "HR"]),
    async (req, res) => {
      try {
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Set ke awal hari

        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1); // Besok untuk range

        const currentPeriod = new Date().toISOString().slice(0, 7); // YYYY-MM

        // 1. Total Karyawan (✅ Perbaiki: employee bukan employees)
        const totalEmployees = await prisma.employee.count();

        // 2. Absensi Hari Ini (✅ Perbaiki: attendance bukan attendance)
        const attendanceToday = await prisma.attendance.findMany({
          where: {
            tanggal: {
              gte: today,
              lt: tomorrow,
            },
          },
        });

        const hadir = attendanceToday.filter(
          (a) => a.status === "hadir"
        ).length;
        const izin = attendanceToday.filter((a) => a.status !== "hadir").length;

        // 3. Cuti Pending (✅ Perbaiki: leaveRequest bukan leave_requests)
        const cutiPending = await prisma.leaveRequest.count({
          where: { status: "pending" },
        });

        // 4. Total Gaji Bulan Ini
        const payrollThisMonth = await prisma.payroll.findMany({
          where: { periode: currentPeriod },
          select: { total_gaji: true },
        });

        const gajiBulanIni = payrollThisMonth.reduce(
          (sum, p) => sum + (parseFloat(p.total_gaji) || 0),
          0
        );

        // ✅ PERBAIKAN UTAMA: Kirim data dengan key yang benar sesuai frontend
        res.json({
          emp: totalEmployees, // ← bukan total_karyawan
          hadir: hadir, // ← bukan hadir_hari_ini
          izin: izin, // ← bukan izin_hari_ini
          cutiPending: cutiPending, // ← bukan cuti_pending
          gajiBulanIni: gajiBulanIni, // ← bukan total_gaji_bulan_ini
        });
      } catch (error) {
        console.error("Error fetching dashboard stats:", error);
        console.error("Error details:", error.message);
        res.status(500).json({
          error: "Gagal mengambil data statistik dashboard.",
          details: error.message, // ← Tambahkan detail error untuk debugging
        });
      }
    }
  );

  return router;
};
