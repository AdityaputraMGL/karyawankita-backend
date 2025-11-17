const express = require("express");
const { authenticateToken, authorizeRole } = require("../middleware/auth");

module.exports = function (prisma) {
  const router = express.Router();

  // ✅ GET - UNTUK SEMUA ROLE (Karyawan lihat milik sendiri, Admin/HR lihat semua)
  router.get("/", authenticateToken, async (req, res) => {
    try {
      const userRole = req.user.role;
      const employeeId = req.user.employeeId || req.user.employee_id;

      console.log("\n📋 Fetching leave requests:");
      console.log("  - User role:", userRole);
      console.log("  - Employee ID:", employeeId);

      let whereClause = {};

      // Jika Karyawan, hanya tampilkan cuti mereka sendiri
      if (userRole === "Karyawan") {
        if (!employeeId) {
          return res.status(400).json({
            error: "Employee ID tidak ditemukan dalam token.",
          });
        }
        whereClause = { employee_id: parseInt(employeeId) };
        console.log("  - Filter: Only employee's own leave");
      } else {
        console.log("  - Filter: All leaves (Admin/HR)");
      }

      const leaveRequests = await prisma.leaveRequest.findMany({
        where: whereClause,
        orderBy: { tanggal_pengajuan: "desc" },
        include: {
          employee: {
            select: {
              nama_lengkap: true,
              jabatan: true,
            },
          },
        },
      });

      console.log("  - Found leave requests:", leaveRequests.length);
      res.json(leaveRequests);
    } catch (error) {
      console.error("❌ Error fetching leave requests:", error);
      res.status(500).json({ error: "Gagal mengambil data permintaan cuti." });
    }
  });

  // ✅ GET permintaan cuti berdasarkan ID Karyawan (untuk backward compatibility)
  router.get("/employee/:employeeId", authenticateToken, async (req, res) => {
    const { employeeId } = req.params;
    const currentUserId = req.user.userId;
    const currentUserRole = req.user.role;

    try {
      const employee = await prisma.employee.findUnique({
        where: { employee_id: parseInt(employeeId) },
        select: { user_id: true },
      });

      if (!employee) {
        return res.status(404).json({ error: "Karyawan tidak ditemukan." });
      }

      // Otorisasi: Karyawan hanya bisa melihat cuti miliknya
      const isSelf = employee.user_id === currentUserId;
      if (currentUserRole !== "Admin" && currentUserRole !== "HR" && !isSelf) {
        return res.status(403).json({ error: "Akses ditolak." });
      }

      const requests = await prisma.leaveRequest.findMany({
        where: { employee_id: parseInt(employeeId) },
        orderBy: { tanggal_pengajuan: "desc" },
        include: {
          employee: {
            select: {
              nama_lengkap: true,
              jabatan: true,
            },
          },
        },
      });
      res.json(requests);
    } catch (error) {
      console.error("Error fetching employee leave:", error);
      res.status(500).json({ error: "Gagal mengambil data cuti." });
    }
  });

  // ✅ POST - Karyawan mengajukan cuti (OTOMATIS AMBIL EMPLOYEE_ID DARI TOKEN)
  router.post("/", authenticateToken, async (req, res) => {
    try {
      const { tanggal_mulai, tanggal_selesai, jenis_pengajuan, alasan } =
        req.body;

      // Ambil employee_id dari token JWT
      const employeeId = req.user.employeeId || req.user.employee_id;
      const userId = req.user.userId || req.user.id;

      console.log("\n📝 Creating leave request:");
      console.log("  - User ID:", userId);
      console.log("  - Employee ID:", employeeId);
      console.log("  - Type:", jenis_pengajuan);
      console.log("  - From:", tanggal_mulai, "To:", tanggal_selesai);

      // Validasi
      if (!employeeId) {
        return res.status(400).json({
          error:
            "Employee ID tidak ditemukan dalam token. Silakan login kembali.",
        });
      }

      if (!tanggal_mulai || !tanggal_selesai || !jenis_pengajuan) {
        return res.status(400).json({
          error:
            "Tanggal mulai, tanggal selesai, dan jenis pengajuan harus diisi.",
        });
      }

      // Verifikasi employee ada di database
      const employee = await prisma.employee.findUnique({
        where: { employee_id: parseInt(employeeId) },
        select: { user_id: true, nama_lengkap: true },
      });

      if (!employee) {
        return res.status(404).json({
          error: "Data karyawan tidak ditemukan di sistem.",
        });
      }

      // Create leave request
      const newLeave = await prisma.leaveRequest.create({
        data: {
          employee_id: parseInt(employeeId),
          tanggal_pengajuan: new Date(),
          tanggal_mulai: new Date(tanggal_mulai),
          tanggal_selesai: new Date(tanggal_selesai),
          jenis_pengajuan,
          alasan: alasan || "",
          status: "pending",
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

      console.log("  ✅ Leave request created:", newLeave.leave_id);
      res.status(201).json(newLeave);
    } catch (error) {
      console.error("❌ Error creating leave request:", error);
      res.status(400).json({
        error: "Gagal mengajukan cuti.",
        details: error.message,
      });
    }
  });

  // ✅ PUT - Update Status Approval (Hanya Admin/HR)
  router.put(
    "/:id/status",
    authenticateToken,
    authorizeRole(["Admin", "HR"]),
    async (req, res) => {
      const { id } = req.params;
      const { status } = req.body;

      try {
        console.log("\n✏️ Updating leave status:");
        console.log("  - Leave ID:", id);
        console.log("  - New status:", status);

        if (
          !["pending", "approved", "rejected"].includes(status.toLowerCase())
        ) {
          return res.status(400).json({
            error:
              "Status tidak valid. Gunakan: pending, approved, atau rejected",
          });
        }

        const updatedLeave = await prisma.leaveRequest.update({
          where: { leave_id: parseInt(id) },
          data: { status: status.toLowerCase() },
          include: {
            employee: {
              select: {
                nama_lengkap: true,
                jabatan: true,
              },
            },
          },
        });

        console.log("  ✅ Leave status updated");
        res.json(updatedLeave);
      } catch (error) {
        console.error("❌ Error updating leave status:", error);
        res.status(400).json({ error: "Gagal memperbarui status cuti." });
      }
    }
  );

  // ✅ DELETE - Hapus cuti (Admin/HR atau Karyawan untuk cuti pending milik sendiri)
  router.delete("/:id", authenticateToken, async (req, res) => {
    try {
      const { id } = req.params;
      const userRole = req.user.role;
      const employeeId = req.user.employeeId || req.user.employee_id;

      console.log("\n🗑️ Deleting leave request:");
      console.log("  - Leave ID:", id);
      console.log("  - User role:", userRole);

      // Ambil data cuti
      const leaveRequest = await prisma.leaveRequest.findUnique({
        where: { leave_id: parseInt(id) },
      });

      if (!leaveRequest) {
        return res.status(404).json({ error: "Data cuti tidak ditemukan." });
      }

      // Validasi akses
      if (userRole === "Karyawan") {
        // Karyawan hanya bisa hapus cuti sendiri yang masih pending
        if (leaveRequest.employee_id !== parseInt(employeeId)) {
          return res.status(403).json({
            error: "Anda hanya bisa menghapus cuti Anda sendiri.",
          });
        }
        if (leaveRequest.status !== "pending") {
          return res.status(403).json({
            error: "Cuti yang sudah disetujui/ditolak tidak bisa dihapus.",
          });
        }
      }

      await prisma.leaveRequest.delete({
        where: { leave_id: parseInt(id) },
      });

      console.log("  ✅ Leave request deleted");
      res.json({ message: "Data cuti berhasil dihapus." });
    } catch (error) {
      console.error("❌ Error deleting leave:", error);
      res.status(500).json({ error: "Gagal menghapus cuti." });
    }
  });

  return router;
};
